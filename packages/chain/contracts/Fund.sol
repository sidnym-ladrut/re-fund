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
  // @notice The nonce for the next withdrawal
  uint8 private _nonce;

  // @notice A local record of the funds deposited into this contract (by ERC20)
  mapping(ERC20Permit => uint256) public treasury;
  mapping(ERC20Permit => bool) private _treasuryTokenMap;
  ERC20Permit[] treasuryTokens;
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
  event Refund(address indexed refunder);

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

    token.permit(funder, address(this), amount, block.timestamp, v, r, s);
    token.transferFrom(funder, address(this), amount);

    if (!_treasuryTokenMap[token]) {
      treasuryTokens.push(token);
      _treasuryTokenMap[token] = true;
    }
    treasury[token] += amount;

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
    treasury[payoutToken] -= amount;
    _nonce++;

    emit Withdrawal(amount);
  }

  // TODO: natspec
  function refund() public onlyManager afterLocked {
    // TODO: Close out the fund (set a flag in an existing variable)
    emit Refund(msg.sender);
  }

  // TODO: natspec
  function funds() public view returns (uint256 amount) {
    amount = 0;
    for (uint256 i = 0; i < treasuryTokens.length; i++) {
      amount += treasury[treasuryTokens[i]];
    }
    return amount;
  }

  //////////////////////
  // Helper Functions //
  //////////////////////

  function hashWithdraw(uint256 amount) public view returns (bytes32) {
    bytes32 structHash = keccak256(abi.encode(_WITHDRAW_TYPEHASH, amount, _nonce));
    bytes32 hash = _hashTypedDataV4(structHash);
    return hash;
  }

  // TODO: natspec
  function _transferOwnership(address newOwner) internal override {
    if (newOwner != msg.sender) {
      revert Ownable.OwnableInvalidOwner(newOwner);
    }
    super._transferOwnership(newOwner);
  }
}
