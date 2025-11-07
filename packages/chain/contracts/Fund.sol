// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract Fund is Ownable, EIP712 {
  ////////////////////////
  // Constant Variables //
  ////////////////////////

  bytes32 private constant _WITHDRAW_TYPEHASH = keccak256("Withdraw(uint256 amount,uint256 nonce)");
  uint256 private constant _CUT_MAXIMUM = 1e4;

  /////////////////////
  // State Variables //
  /////////////////////

  // @notice The account performing the work to be compensated
  // address public worker;
  // @notice The account responsible for reviewing the work and authorizing payouts
  address public oracle;
  // @notice The 2-digits cut amount provisioned for the oracle on payout
  uint256 public oracleCut;

  // @notice The address of the ERC20 that will be used to comensate the worker
  ERC20Permit public payoutToken;
  // @notice The IPFS CID of the JSON file with the terms of the work
  bytes32 public termsCID;
  // @notice The total amount of value withdrawn from this fund
  uint256 private _withdrawn;
  // @notice The nonce for the next withdrawal
  uint8 private _nonce;

  // @notice A local record of the funds deposited into this contract (by ERC20, funder)
  mapping(ERC20Permit => mapping(address => uint256)) private _treasury;
  // @notice Existence record for ERC20 entries in `_treasury`
  mapping(ERC20Permit => bool) private _treasuryTokenMap;
  // @notice Key list for ERC20 entries in `_treasury`
  ERC20Permit[] public treasuryTokens;
  // @notice Existence record for address entries in `_treasury`
  mapping(address => bool) private _treasuryFunderMap;
  // @notice Key list for address entries in `_treasury`
  address[] public treasuryFunders;
  // @notice The oracle's signature on the work terms, which seals the fund
  bytes public termsSignature;

  ////////////
  // Events //
  ////////////

  // @notice Notification for when tokens are deposited into the fund
  event Deposit(ERC20Permit indexed token, address indexed from, uint256 amount);
  // @notice Notification for when tokens are withdrawn from the fund
  event Withdrawal(uint256 amount);
  // @notice Notification for when a refund is issued
  event Refund(address indexed refunder, uint256 amount);

  ///////////////
  // Modifiers //
  ///////////////

  // TODO: natspec
  modifier onlyManager() {
    require(msg.sender == owner() || msg.sender == oracle, "Not a fund manager (i.e. worker or oracle)");
    _;
  }

  // TODO: natspec
  modifier beforeLocked() {
    require(termsSignature.length == 0, "Fund terms are locked");
    _;
  }

  // TODO: natspec
  modifier afterLocked() {
    require(termsSignature.length == 65, "Fund terms are not yet locked");
    _;
  }

  ///////////////
  // Functions //
  ///////////////

  // TODO: natspec
  constructor(address oracle_, uint256 cut, ERC20Permit token, bytes32 terms)
      Ownable(msg.sender) EIP712("Fund", "1") {
    updateTerms(oracle_, cut, token, terms);
  }

  // TODO: natspec
  function worker() external view returns (address) {
    return owner();
  }

  // TODO: natspec
  function updateTerms(address oracle_, uint256 cut, ERC20Permit token, bytes32 terms)
      public beforeLocked {
    oracle = oracle_;
    oracleCut = cut;
    payoutToken = token;
    termsCID = terms;
  }

  // TODO: natspec
  function lockTerms(bytes memory oracleSignature) public onlyOwner beforeLocked {
    (address signer, ECDSA.RecoverError error, ) = ECDSA.tryRecover(
      MessageHashUtils.toEthSignedMessageHash(termsCID),
      oracleSignature
    );
    require(error == ECDSA.RecoverError.NoError, "Malformed signature provided");
    require(signer == oracle, "Invalid signer provided (must be the contract oracle)");
    termsSignature = oracleSignature;
  }

  // TODO: natspec
  function deposit(ERC20Permit token, address funder, uint256 amount, bytes memory funderSignature)
      public afterLocked {
    // TODO: Remove
    require(token == payoutToken, "Only deposits in the contract's payout token are currently accepted");

    // TODO: Refactor into standalone function (?)
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
    token.permit(funder, address(this), amount, block.timestamp, v, r, s);
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

  // TODO: natspec
  function withdraw(uint256 amount, bytes memory oracleSignature)
      public onlyOwner afterLocked {
    require(amount > 0, "Must withdraw a non-zero sum");
    require(amount <= funds(), "Overdraft on the existing funds");

    (address signer, ECDSA.RecoverError error, ) = ECDSA.tryRecover(hashWithdraw(amount), oracleSignature);
    require(error == ECDSA.RecoverError.NoError, "Malformed signature provided");
    require(signer == oracle, "Invalid signer provided (must be the contract oracle)");

    uint256 oracleAmount = (amount * oracleCut) / _CUT_MAXIMUM;
    payoutToken.transfer(owner(), amount - oracleAmount);
    payoutToken.transfer(oracle, oracleAmount);
    _withdrawn += amount;
    _nonce++;

    emit Withdrawal(amount);
  }

  // TODO: natspec
  function refund() public onlyManager afterLocked {
    // TODO: Close out the fund (set a flag using an existing variable)
    // TODO: Any per-token remainder should be sent to the oracle
    uint256 fundsRegistered_ = fundsRegistered();
    uint256 fundsRemaining = (fundsRegistered_ - _withdrawn);

    uint256 fundsRefunded = 0;
    for (uint256 i = 0; i < treasuryTokens.length; i++) {
      ERC20Permit token = treasuryTokens[i];
      for (uint256 j = 0; j < treasuryFunders.length; j++) {
        address funder = treasuryFunders[j];

        uint256 funderTokenSum = _treasury[token][funder];
        if (funderTokenSum > 0) {
          uint256 funderTokenRefund = (funderTokenSum * fundsRemaining) / fundsRegistered_;
          token.transfer(funder, funderTokenRefund);
          fundsRefunded += funderTokenRefund;
        }
      }
    }

    emit Refund(msg.sender, fundsRefunded);
  }

  // TODO: natspec
  function funds() public view returns (uint256 amount) {
    return fundsAvailable();
  }

  // TODO: natspec
  function fundsAvailable() public view returns (uint256 amount) {
    for (uint256 i = 0; i < treasuryTokens.length; i++) {
      amount += treasuryTokens[i].balanceOf(address(this));
    }
    return amount;
  }

  // TODO: natspec
  function fundsRegistered() public view returns (uint256 amount) {
    for (uint256 i = 0; i < treasuryTokens.length; i++) {
      for (uint256 j = 0; j < treasuryFunders.length; j++) {
        amount += _treasury[treasuryTokens[i]][treasuryFunders[j]];
      }
    }
    return amount;
  }

  //////////////////////
  // Helper Functions //
  //////////////////////

  function hashWithdraw(uint256 amount) public view returns (bytes32 hash) {
    bytes32 structHash = keccak256(abi.encode(_WITHDRAW_TYPEHASH, amount, _nonce));
    return _hashTypedDataV4(structHash);
  }

  // TODO: natspec
  function _transferOwnership(address newOwner) internal override {
    if (newOwner != msg.sender) {
      revert Ownable.OwnableInvalidOwner(newOwner);
    }
    super._transferOwnership(newOwner);
  }
}
