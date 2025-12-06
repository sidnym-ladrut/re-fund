// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {IFund} from "./IFund.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {ISwapRouter} from "./interfaces/ISwapRouter.sol";
import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";

/// @title Fund
/// @notice A treasury contract that manages payouts to a worker (the owner) with the approval of an oracle (the assessor) with ERC20 donations from funders (any donor)
/// @author ~sidnym-ladrut -- DM on Urbit for more details
contract Fund is IFund, Initializable, OwnableUpgradeable, EIP712Upgradeable, ReentrancyGuardUpgradeable {
  using SafeERC20 for IERC20;

  ///////////////
  // Constants //
  ///////////////

  /// @notice EIP712 type hash for the `SignTerms` action
  bytes32 private constant _SIGNTERMS_TYPEHASH =
    keccak256("SignTerms(bytes32 terms)");
  /// @notice EIP712 type hash for the `Withdraw` action
  bytes32 private constant _WITHDRAW_TYPEHASH =
    keccak256("Withdraw(address fund,uint256 amount,uint256 nonce)");
  /// @notice The maximum permissible cut value (i.e. 2-digits 100%)
  uint256 private constant _CUT_MAXIMUM = 1e4;
  /// @notice Default Uniswap V3 pool fee tier (0.3%)
  uint24 private constant _UNISWAP_POOL_FEE = 3000;
  /// @notice Maximum staleness for Chainlink price data (1 hour)
  uint256 private constant _CHAINLINK_MAX_STALENESS = 3600;

  /// @notice Uniswap V3 SwapRouter address (immutable for gas efficiency, shared across clones)
  address public immutable SWAP_ROUTER;

  /////////////////////
  // State Variables //
  /////////////////////

  /// @notice The account responsible for reviewing the work and authorizing payouts
  address public oracle;
  /// @notice The 2-digits cut amount provisioned for the oracle on payout
  uint256 public oracleCut;

  /// @notice The address of the ERC20 that will be used to compensate the worker
  IERC20 public payoutToken;
  /// @notice The terms of the work for this fund (generally stored as the IPFS CID of the JSON file)
  string public terms;
  /// @notice The nonce for the next withdrawal
  uint256 public nonce;
  /// @notice The flag for if a fund has been terminated
  bool public closed;
  /// @notice The total amount of value withdrawn from this fund
  uint256 private _withdrawn;

  /// @notice A local record of the funds deposited into this contract (by ERC20, funder)
  mapping(IERC20 => mapping(address => uint256)) private _treasury;
  /// @notice Existence record for ERC20 entries in {_treasury}
  mapping(IERC20 => bool) private _treasuryTokenMap;
  /// @notice Key list for ERC20 entries in {_treasury}
  IERC20[] public treasuryTokens;
  /// @notice Existence record for address entries in {_treasury}
  mapping(address => bool) private _treasuryFunderMap;
  /// @notice Key list for address entries in {_treasury}
  address[] public treasuryFunders;
  /// @notice The oracle's signature on the work terms, which seals the fund
  bytes public termsSignature;

  /// @notice Mapping of token addresses to their Chainlink price feed addresses (token => priceFeed)
  /// @dev Price feeds should return the token price in the payout token's denomination
  mapping(IERC20 => address) public tokenFeeds;

  ///////////////
  // Modifiers //
  ///////////////

  /// @notice Constrains the caller to the contract's worker (owner) or oracle
  modifier onlyManager() {
    require(msg.sender == owner() || msg.sender == oracle, "Not a fund manager (i.e. worker or oracle)");
    _;
  }

  /// @notice Constrains the call time to before {lockTerms} is called
  modifier beforeLocked() {
    require(termsSignature.length == 0, "Fund terms are locked");
    _;
  }

  /// @notice Constrains the call time to after {lockTerms} is called
  modifier afterLocked() {
    require(termsSignature.length == 65, "Fund terms are not yet locked");
    _;
  }

  /// @notice Constrains the call time to before {close} is called
  modifier beforeClosed() {
    require(!closed, "Fund has already been closed");
    _;
  }

  ///////////////
  // Functions //
  ///////////////

  /// @notice Constructs an empty template fund owned by the calling contract
  /// @dev This should only be invoked once to create the implementation contract used by the factory
  /// @param _swapRouter The Uniswap V3 Router address for token swaps
  constructor(address _swapRouter) initializer {
    require(_swapRouter != address(0), "Router cannot be zero address");
    SWAP_ROUTER = _swapRouter;

    __Ownable_init(msg.sender);
    __EIP712_init("Fund", "1");
    __ReentrancyGuard_init();
    oracle = msg.sender;
  }

  /// @notice Initializes a contract owned by a given worker with a set of starting terms
  /// @dev This should only be invoked internally by the factory to initialize clone proxies
  /// @param args The encoded arguments array containing the worker address and the terms (see {updateTerms})
  function initialize(bytes calldata args) initializer external {
    (address worker_, address oracle_, uint256 cut, address token, string memory terms_) =
      abi.decode(args, (address, address, uint256, address, string));

    __Ownable_init(worker_);
    __EIP712_init("Fund", "1");
    __ReentrancyGuard_init();
    oracle = oracle_;

    updateTerms(cut, IERC20(token), terms_);
  }

  /// @inheritdoc IFund
  function worker() external view returns (address) {
    return owner();
  }

  /// @notice Modifies the set of terms for this fund contract
  /// @param cut The percentage compensation allotted to the oracle on withdrawal as a 2-digits integer value
  /// @param token The address of the ERC20 token that will be paid out to the worker
  /// @param terms_ The IPFS CID of the JSON blob defining the scope of work for this fund
  function updateTerms(uint256 cut, IERC20 token, string memory terms_)
      public beforeLocked {
    require(cut <= _CUT_MAXIMUM, "Oracle cut must be a 2-digit percentage (0 <= cut <= 1e4)");
    oracleCut = cut;
    payoutToken = token;
    terms = terms_;
  }

  /// @notice Sets the Chainlink price feed address for a token
  /// @dev Managers can configure price feeds for tokens to enable proper valuation
  /// @param token The token address to set the feed for
  /// @param feed The Chainlink AggregatorV3Interface address
  function setTokenFeed(IERC20 token, address feed) public onlyManager {
    tokenFeeds[token] = feed;
  }

  /// @notice Finalizes the contract terms with a signature from the oracle (i.e. assessor)
  /// @dev The {hashSignTerms} function can be used to generate the EIP-712 signature payload for the current terms
  /// @param oracleSignature An EIP-191 signed message of the {terms} from the oracle
  function lockTerms(bytes memory oracleSignature) public onlyOwner beforeLocked {
    (address signer, ECDSA.RecoverError error, ) = ECDSA.tryRecover(hashSignTerms(), oracleSignature);
    require(error == ECDSA.RecoverError.NoError, "Malformed signature provided");
    require(signer == oracle, "Invalid signer provided (must be the contract oracle)");
    termsSignature = oracleSignature;
  }

  /// @inheritdoc IFund
  /// @notice Deposits tokens using standard approve/transferFrom pattern (for non-permit tokens like USDT)
  function deposit(IERC20 token, uint256 amount)
      public afterLocked beforeClosed nonReentrant {
    token.safeTransferFrom(msg.sender, address(this), amount);
    _registerDeposit(token, msg.sender, amount);
  }

  /// @inheritdoc IFund
  /// @notice Deposits a specified amount of a given token from some funder into this fund using ERC20Permit
  /// @dev Performing token transfers within this contract allows them to be tracked for refunds, unlike ERC20.transfer calls
  /// @dev For details on 'Permit' signature construction, see: https://eips.ethereum.org/EIPS/eip-2612#specification
  function deposit(ERC20Permit token, address funder, uint256 amount, uint256 deadline, bytes memory funderSignature)
      public afterLocked beforeClosed nonReentrant {
    bytes32 r;
    bytes32 s;
    uint8 v;
    assembly ("memory-safe") {
      r := mload(add(funderSignature, 0x20))
      s := mload(add(funderSignature, 0x40))
      v := byte(0, mload(add(funderSignature, 0x60)))
    }

    token.permit(funder, address(this), amount, deadline, v, r, s);
    IERC20(address(token)).safeTransferFrom(funder, address(this), amount);
    _registerDeposit(IERC20(address(token)), funder, amount);
  }

  /// @notice Internal helper to track deposited funds
  /// @param token The token being deposited
  /// @param funder The address of the depositor
  /// @param amount The amount being deposited
  function _registerDeposit(IERC20 token, address funder, uint256 amount) internal {
    if (!_treasuryTokenMap[token]) {
      treasuryTokens.push(token);
      _treasuryTokenMap[token] = true;
    }
    if (!_treasuryFunderMap[funder]) {
      treasuryFunders.push(funder);
      _treasuryFunderMap[funder] = true;
    }
    _treasury[token][funder] += amount;

    emit Deposit(token, funder, amount);
  }

  /// @notice Withdraws an oracle-approved amount of {payoutToken} to {worker}
  /// @dev The {hashWithdraw} function can be used to generate the EIP-712 signature payload for the current nonce
  /// @dev Automatically swaps non-payout tokens to payout token via Uniswap V3
  /// @param amount The amount of {payoutToken} that will be withdrawn
  /// @param oracleSignature An EIP-712 signature from the {oracle} authorizing an {amount} transfer to {worker}
  function withdraw(uint256 amount, bytes memory oracleSignature)
      public onlyOwner afterLocked nonReentrant {
    require(amount > 0, "Must withdraw a non-zero sum");

    (address signer, ECDSA.RecoverError error, ) = ECDSA.tryRecover(hashWithdraw(amount), oracleSignature);
    require(error == ECDSA.RecoverError.NoError, "Malformed signature provided");
    require(signer == oracle, "Invalid signer provided (must be the contract oracle)");

    // Auto-swap non-payout tokens to payout token via Uniswap (if available)
    _swapAllToPayoutToken();

    uint256 available = payoutToken.balanceOf(address(this));
    require(amount <= available, "Overdraft on the existing funds");

    // NOTE: This method does not incrementally update `_treasury` to save gas. This makes `withdraw`s cheaper
    // (the more common path) than `refund`s (the 'last resort escape hatch' path)
    uint256 oracleAmount = (amount * oracleCut) / _CUT_MAXIMUM;
    payoutToken.safeTransfer(owner(), amount - oracleAmount);
    payoutToken.safeTransfer(oracle, oracleAmount);
    _withdrawn += amount;
    nonce++;

    emit Withdrawal(amount);
  }

  /// @notice Internal helper to swap all non-payout tokens to payout token via Uniswap V3
  function _swapAllToPayoutToken() internal {
    for (uint256 i = 0; i < treasuryTokens.length; i++) {
      IERC20 token = treasuryTokens[i];
      if (token != payoutToken) {
        uint256 balance = token.balanceOf(address(this));
        if (balance > 0) {
          token.safeIncreaseAllowance(SWAP_ROUTER, balance);
          ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: address(token),
            tokenOut: address(payoutToken),
            fee: _UNISWAP_POOL_FEE,
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: balance,
            amountOutMinimum: 0, // NOTE: In production, add slippage protection using oracle price
            sqrtPriceLimitX96: 0
          });
          ISwapRouter(SWAP_ROUTER).exactInputSingle(params);
        }
      }
    }
  }

  /// @notice Refunds all unclaimed tokens in this fund to their respective funders
  /// @dev Refunds are proportional to the funder's funding VALUE (using Chainlink oracles) and remaining funds
  /// @dev Converts all tokens to payout token first for simplified distribution
  function refund() public onlyManager afterLocked nonReentrant {
    // 1. Convert all tokens to payout token first for simplified distribution
    _swapAllToPayoutToken();

    uint256 fundsRemaining = payoutToken.balanceOf(address(this));
    require(fundsRemaining > 0, "No funds to refund");

    // 2. Calculate total registered value (in payout token terms using Chainlink)
    uint256 totalRegisteredValue = 0;
    for (uint256 i = 0; i < treasuryTokens.length; i++) {
      uint256 tokenTotalDeposit = 0;
      for (uint256 j = 0; j < treasuryFunders.length; j++) {
        tokenTotalDeposit += _treasury[treasuryTokens[i]][treasuryFunders[j]];
      }
      if (tokenTotalDeposit > 0) {
        totalRegisteredValue += _getTokenValueInPayout(treasuryTokens[i], tokenTotalDeposit);
      }
    }
    require(totalRegisteredValue > 0, "No registered value to refund");

    // 3. Refund proportional to original value contribution
    for (uint256 i = 0; i < treasuryFunders.length; i++) {
      address funder = treasuryFunders[i];
      uint256 funderOriginalValue = 0;

      for (uint256 j = 0; j < treasuryTokens.length; j++) {
        uint256 deposit_ = _treasury[treasuryTokens[j]][funder];
        if (deposit_ > 0) {
          funderOriginalValue += _getTokenValueInPayout(treasuryTokens[j], deposit_);
          _treasury[treasuryTokens[j]][funder] = 0;
        }
      }

      if (funderOriginalValue > 0) {
        // Multiplication before division to minimize rounding errors (per EVM bootcamp best practices)
        uint256 refundAmount = (funderOriginalValue * fundsRemaining) / totalRegisteredValue;
        if (refundAmount > 0) {
          payoutToken.safeTransfer(funder, refundAmount);
        }
      }
    }

    // Reset withdrawn tracking
    _withdrawn = 0;

    emit Refund(msg.sender, fundsRemaining);
  }

  /// @notice Helper to get the value of a token amount in payout token terms using Chainlink
  /// @param token The token to price
  /// @param amount The amount of the token
  /// @return The equivalent value in payout token terms
  function _getTokenValueInPayout(IERC20 token, uint256 amount) internal view returns (uint256) {
    if (token == payoutToken) return amount;

    // Get the deposit token's price feed
    address feedAddr = tokenFeeds[token];
    if (feedAddr == address(0)) return 0; // No feed configured means value is 0 (prevents stuck funds)

    AggregatorV3Interface feed = AggregatorV3Interface(feedAddr);
    (
      ,
      int256 tokenPrice,
      ,
      uint256 tokenUpdatedAt,
    ) = feed.latestRoundData();

    // Validate price data is not stale
    if (tokenPrice <= 0 || block.timestamp - tokenUpdatedAt > _CHAINLINK_MAX_STALENESS) {
      return 0;
    }

    // Get the payout token's price feed (needed to convert USD value to payout token amount)
    address payoutFeedAddr = tokenFeeds[payoutToken];
    if (payoutFeedAddr == address(0)) {
      // No payout feed = assume payout token is USD-pegged (1:1)
      // Just return the USD value adjusted for decimals
      return (amount * uint256(tokenPrice)) / (10 ** feed.decimals());
    }

    AggregatorV3Interface payoutFeed = AggregatorV3Interface(payoutFeedAddr);
    (
      ,
      int256 payoutPrice,
      ,
      uint256 payoutUpdatedAt,
    ) = payoutFeed.latestRoundData();

    // Validate payout price data is not stale
    if (payoutPrice <= 0 || block.timestamp - payoutUpdatedAt > _CHAINLINK_MAX_STALENESS) {
      return 0;
    }

    // Convert: amount in deposit token → value in payout token
    // Formula: (amount * tokenPriceUSD * payoutDecimals) / (payoutPriceUSD * tokenDecimals)
    // Since both feeds use same decimals (8), they cancel out for the price ratio
    // But we need to adjust for token decimal differences
    uint8 tokenDecimals = IERC20Metadata(address(token)).decimals();
    uint8 payoutDecimals = IERC20Metadata(address(payoutToken)).decimals();
    
    // Calculate: (amount * tokenPrice * 10^payoutDecimals) / (payoutPrice * 10^tokenDecimals)
    return (amount * uint256(tokenPrice) * (10 ** payoutDecimals)) / (uint256(payoutPrice) * (10 ** tokenDecimals));
  }

  /// @notice Closes a fund to any more donations (e.g. when work is complete)
  function close() public onlyManager afterLocked beforeClosed {
    closed = true;
  }

  /// @notice Alias for {fundsAvailable}
  function funds() public view returns (uint256 amount) {
    return fundsAvailable();
  }

  /// @notice The sum of all contributions (registered & unregistered) to this fund expressed in the payout currency
  /// @dev Registered: Funds contributed via {deposit} with known donors and quantities
  /// @dev Unregistered: Funds contributed outside of this contract with untracked donors
  /// @dev Values are estimated using Chainlink price feeds
  function fundsAvailable() public view returns (uint256 amount) {
    for (uint256 i = 0; i < treasuryTokens.length; i++) {
      uint256 balance = treasuryTokens[i].balanceOf(address(this));
      amount += _getTokenValueInPayout(treasuryTokens[i], balance);
    }
    return amount;
  }

  /// @notice The sum of all registered contributions to this fund expressed in the payout currency
  /// @dev Registered: Funds contributed via {deposit} with known donors and quantities
  /// @dev Unregistered: Funds contributed outside of this contract with untracked donors
  /// @dev Values are estimated using Chainlink price feeds
  function fundsRegistered() public view returns (uint256 amount) {
    for (uint256 i = 0; i < treasuryTokens.length; i++) {
      uint256 tokenTotal = 0;
      for (uint256 j = 0; j < treasuryFunders.length; j++) {
        tokenTotal += _treasury[treasuryTokens[i]][treasuryFunders[j]];
      }
      amount += _getTokenValueInPayout(treasuryTokens[i], tokenTotal);
    }
    return amount;
  }

  /// @notice Returns the active {Status} for a fund
  /// @return stat The current status of a fund: pending (created & not locked), active (locked & not closed), or closed (done)
  function status() public view returns (Status stat) {
    return closed
      ? Status.Closed
      : (termsSignature.length == 0)
        ? Status.Pending
        : Status.Active;
  }

  //////////////////////
  // Helper Functions //
  //////////////////////

  /// @notice Generates an EIP-712 'SignTerms' signature payload for hash of the current terms
  /// @dev For details on signature construction, see: https://eips.ethereum.org/EIPS/eip-712#definition-of-domainseparator
  /// @return hash The EIP-712 'SignTerms' payload that can be signed by the {oracle} to authorize term lock-in
  function hashSignTerms() public view returns (bytes32 hash) {
    bytes32 structHash = keccak256(abi.encode(_SIGNTERMS_TYPEHASH, keccak256(bytes(terms))));
    return _hashTypedDataV4(structHash);
  }

  /// @notice Generates an EIP-712 'Withdraw' signature payload for the given amount at current withdrawal nonce
  /// @dev For details on signature construction, see: https://eips.ethereum.org/EIPS/eip-712#definition-of-domainseparator
  /// @param amount The amount of {payoutToken} that will be withdrawn
  /// @return hash The EIP-712 'Withdraw' payload that can be signed by the {oracle} to authorize a withdrawal
  function hashWithdraw(uint256 amount) public view returns (bytes32 hash) {
    bytes32 structHash = keccak256(abi.encode(_WITHDRAW_TYPEHASH, address(this), amount, nonce));
    return _hashTypedDataV4(structHash);
  }

  /// @inheritdoc OwnableUpgradeable
  /// @dev This override prevents the fund contract from being transferred to another owner
  function _transferOwnership(address newOwner) internal override {
    if (owner() != address(0)) {
      revert OwnableUpgradeable.OwnableInvalidOwner(newOwner);
    }
    super._transferOwnership(newOwner);
  }
}
