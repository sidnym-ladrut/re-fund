// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {IFund} from "./IFund.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title Fund
/// @notice A treasury contract that manages payouts to a worker (the owner) with the approval of an oracle (the assessor) with ERC20 donations from funders (any donor)
/// @author ~sidnym-ladrut -- DM on Urbit for more details
contract Fund is IFund, Initializable, OwnableUpgradeable, EIP712Upgradeable, ReentrancyGuardUpgradeable {
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

  /////////////////////
  // State Variables //
  /////////////////////

  /// @notice The account responsible for reviewing the work and authorizing payouts
  address public oracle;
  /// @notice The 2-digits cut amount provisioned for the oracle on payout
  uint256 public oracleCut;

  /// @notice The address of the ERC20 that will be used to comensate the worker
  /// @dev The ERC20 type is constrained to ERC20Permit to enable 1-transaction, gas-efficient deposits
  /// @dev See https://eips.ethereum.org/EIPS/eip-2612#abstract
  ERC20Permit public payoutToken;
  /// @notice The terms of the work for this fund (generally stored as the IPFS CID of the JSON file)
  string public terms;
  /// @notice The nonce for the next withdrawal
  uint256 public nonce;
  /// @notice The flag for if a fund has been terminated
  bool public closed;
  /// @notice The total amount of value withdrawn from this fund
  uint256 private _withdrawn;

  /// @notice A local record of the funds deposited into this contract (by ERC20, funder)
  mapping(ERC20Permit => mapping(address => uint256)) private _treasury;
  /// @notice Existence record for ERC20 entries in {_treasury}
  mapping(ERC20Permit => bool) private _treasuryTokenMap;
  /// @notice Key list for ERC20 entries in {_treasury}
  ERC20Permit[] public treasuryTokens;
  /// @notice Existence record for address entries in {_treasury}
  mapping(address => bool) private _treasuryFunderMap;
  /// @notice Key list for address entries in {_treasury}
  address[] public treasuryFunders;
  /// @notice The oracle's signature on the work terms, which seals the fund
  bytes public termsSignature;

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
  constructor() initializer {
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
    oracle = oracle_;

    updateTerms(cut, ERC20Permit(token), terms_);
  }

  /// @inheritdoc IFund
  function worker() external view returns (address) {
    return owner();
  }

  /// @notice Modifies the set of terms for this fund contract
  /// @param cut The percentage compensation allotted to the oracle on withdrawal as a 2-digits integer value
  /// @param token The address of the ERC20Permit token that will be paid out to the worker
  /// @param terms_ The IPFS CID of the JSON blob defining the scope of work for this fund
  function updateTerms(uint256 cut, ERC20Permit token, string memory terms_)
      public beforeLocked {
    require(cut <= _CUT_MAXIMUM, "Oracle cut must be a 2-digit percentage (0 <= cut <= 1e4)");
    oracleCut = cut;
    payoutToken = token;
    terms = terms_;
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

  /// @notice Deposits a specified amount of a given token from some funder into this fund
  /// @dev Performing token transfers within this contract allows them to be tracked for refunds, unlike ERC20.transfer calls
  /// @dev For details on 'Permit' signature construction, see: https://eips.ethereum.org/EIPS/eip-2612#specification
  /// @param token The ERC20 token to be deposited
  /// @param funder The address of the account that will be depositing
  /// @param amount The amount of the given token that will deposited
  /// @param deadline The last permitted block time for the signed deposit (as a Unix epoch value)
  /// @param funderSignature An ERC20Permit signature from {funder} authorizing {amount} of {token} to be transferred
  function deposit(ERC20Permit token, address funder, uint256 amount, uint256 deadline, bytes memory funderSignature)
      public afterLocked beforeClosed nonReentrant {
    // TODO: Remove when multiple token types are supported
    require(token == payoutToken, "Only deposits in the contract's payout token are currently accepted");

    bytes32 r;
    bytes32 s;
    uint8 v;
    assembly ("memory-safe") {
      r := mload(add(funderSignature, 0x20))
      s := mload(add(funderSignature, 0x40))
      v := byte(0, mload(add(funderSignature, 0x60)))
    }

    // TODO: Almost certainly need to use a passed-in timestamp so that the user doesn't need
    // to guess the timestamp of the submission block for this operation
    token.permit(funder, address(this), amount, deadline, v, r, s);
    token.transferFrom(funder, address(this), amount);

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
  /// @param amount The amount of {payoutToken} that will be withdrawn
  /// @param oracleSignature An EIP-712 signature from the {oracle} authorizing an {amount} transfer to {worker}
  function withdraw(uint256 amount, bytes memory oracleSignature)
      public onlyOwner afterLocked nonReentrant {
    require(amount > 0, "Must withdraw a non-zero sum");
    require(amount <= funds(), "Overdraft on the existing funds");

    (address signer, ECDSA.RecoverError error, ) = ECDSA.tryRecover(hashWithdraw(amount), oracleSignature);
    require(error == ECDSA.RecoverError.NoError, "Malformed signature provided");
    require(signer == oracle, "Invalid signer provided (must be the contract oracle)");

    // NOTE: This method does not incrementally update `_treasury` to save gas. This makes `withdraw`s cheaper
    // (the more common path) than `refund`s (the 'last resort escape hatch' path)
    uint256 oracleAmount = (amount * oracleCut) / _CUT_MAXIMUM;
    payoutToken.transfer(owner(), amount - oracleAmount);
    payoutToken.transfer(oracle, oracleAmount);
    _withdrawn += amount;
    nonce++;

    emit Withdrawal(amount);
  }

  /// @notice Refunds all unclaimed tokens in this fund to their respective funders
  /// @dev Refunds are proportional to (1) the funder's funding amount since fund activation or prior refund and (2) the remaining funds in this contract
  function refund() public onlyManager afterLocked nonReentrant {
    uint256 fundsRegistered_ = fundsRegistered();
    uint256 fundsRemaining = (fundsRegistered_ - _withdrawn);
    require(fundsRemaining > 0, "Must refund a non-zero sum");

    for (uint256 i = 0; i < treasuryTokens.length; i++) {
      ERC20Permit token = treasuryTokens[i];
      uint256 tokensRefunded = 0;
      for (uint256 j = 0; j < treasuryFunders.length; j++) {
        address funder = treasuryFunders[j];

        uint256 funderTokenSum = _treasury[token][funder];
        if (funderTokenSum > 0) {
          uint256 funderTokenRefund = (funderTokenSum * fundsRemaining) / fundsRegistered_;
          token.transfer(funder, funderTokenRefund);
          tokensRefunded += funderTokenRefund;
        }
        _treasury[token][funder] = 0;
      }

      uint256 tokensLeftover = token.balanceOf(address(this));
      if (tokensLeftover > 0) {
        token.transfer(oracle, tokensLeftover);
      }
    }
    _withdrawn = 0;

    emit Refund(msg.sender, fundsRemaining);
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
  function fundsAvailable() public view returns (uint256 amount) {
    for (uint256 i = 0; i < treasuryTokens.length; i++) {
      amount += treasuryTokens[i].balanceOf(address(this));
    }
    return amount;
  }

  /// @notice The sum of all registered contributions to this fund expressed in the payout currency
  /// @dev Registered: Funds contributed via {deposit} with known donors and quantities
  /// @dev Unregistered: Funds contributed outside of this contract with untracked donors
  function fundsRegistered() public view returns (uint256 amount) {
    for (uint256 i = 0; i < treasuryTokens.length; i++) {
      for (uint256 j = 0; j < treasuryFunders.length; j++) {
        amount += _treasury[treasuryTokens[i]][treasuryFunders[j]];
      }
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
