// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract Fund is Ownable {
  // @notice Notification for when tokens are deposited into the fund
  event Deposit(IERC20Permit indexed token, address indexed from, uint256 amount);
  // @notice Notification for when tokens are withdrawn from the fund
  event Withdrawal(uint256 amount);

  // @notice The account performing the work to be compensated
  // address public worker;
  // @notice The account responsible for reviewing the work and authorizing payouts
  address public oracle;
  // @notice The 2-digits cut amount provisioned for the oracle on payout
  uint256 public oracleCut;

  // @notice The address of the ERC20 that will be used to comensate the worker
  IERC20Permit public payoutToken;
  // @notice The IPFS CID of the JSON file with the terms of the work
  bytes32 public termsCID;

  // TODO: Think about how to implement refunds in this model (probably need
  // another mapping)
  // @notice A local record of the funds deposited into this contract (by ERC20)
  mapping(IERC20Permit => uint256) public funds;
  // @notice The oracle's signature on the work terms, which seals the fund
  bytes public termsSignature;

  // TODO: natspec
  constructor(address oracle_, uint256 cut, IERC20Permit token, bytes32 terms)
      Ownable(msg.sender) {
    updateTerms(oracle_, cut, token, terms);
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

  // TODO: natspec
  function worker() external view returns (address) {
      return owner();
  }

  // TODO: natspec
  function updateTerms(address oracle_, uint256 cut, IERC20Permit token, bytes32 terms)
      public beforeLocked {
    oracle = oracle_;
    oracleCut = cut;
    payoutToken = token;
    termsCID = terms;
  }

  // TODO: natspec
  function lockTerms(bytes memory signature) public beforeLocked {
    (address signer, ECDSA.RecoverError error, ) = ECDSA.tryRecover(
      MessageHashUtils.toEthSignedMessageHash(termsCID),
      signature
    );
    require(error == ECDSA.RecoverError.NoError, "Bad signature");
    require(signer == oracle, "Mismatched signer");
    termsSignature = signature;
  }

  // TODO: natspec
  function deposit(IERC20Permit token, address funder, uint256 amount, bytes memory signature)
      public afterLocked {
    // TODO: approve as msg.sender... how?
    // TODO: delegate msg.sender
    // token.permit(
    //   msg.sender,
    //   address(this),
    //   amount,
    //   uint256 deadline,
    //   uint8 v,
    //   bytes32 r,
    //   bytes32 s
    // );
    // token.transferFrom(msg.sender, address(this), amount);
    // token.permit(...);
  }

  // TODO: natspec
  function _transferOwnership(address newOwner) internal override {
    if (newOwner != msg.sender) {
      revert Ownable.OwnableInvalidOwner(newOwner);
    }
    super._transferOwnership(newOwner);
  }
}
