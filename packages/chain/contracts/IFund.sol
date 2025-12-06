// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IFund
/// @notice Interface for Fund contracts
/// @author ~sidnym-ladrut -- DM on Urbit for more details
interface IFund {
  /////////////////
  // Types/Enums //
  /////////////////

  /// @notice Identifiers for the different states a fund can be in
  enum Status {
    Pending,
    Active,
    Closed
  }

  /// @notice Identifiers for the different roles an account can have in a fund
  enum Role {
    Worker,
    Oracle,
    Funder
  }

  ////////////
  // Events //
  ////////////

  /// @notice Notification for when tokens are deposited into the fund
  event Deposit(IERC20 indexed token, address indexed from, uint256 amount);
  /// @notice Notification for when tokens are withdrawn from the fund
  event Withdrawal(uint256 amount);
  /// @notice Notification for when a refund is issued
  event Refund(address indexed refunder, uint256 amount);

  ///////////////
  // Functions //
  ///////////////

  /// @notice Initializes a fund given a generic set of terms (see individual implementations for details)
  function initialize(bytes calldata args) external;

  /// @notice The worker performing the tasks outlined in the terms for this fund
  /// @dev This value is always the same as the contract owner
  function worker() external returns (address);
  /// @notice The oracle assessing the tasks to be performed by the worker
  /// @dev This value can be the same as {worker} for a self-assessed contract
  function oracle() external returns (address);

  /// @notice Deposits tokens using standard approve/transferFrom pattern (for non-permit tokens like USDT)
  /// @param token The ERC20 token to be deposited
  /// @param amount The amount to deposit (must have prior approval)
  function deposit(IERC20 token, uint256 amount) external;

  /// @notice Deposits tokens using ERC20Permit gasless approval (for permit-compatible tokens)
  /// @param token The ERC20Permit token to be deposited
  /// @param funder The address of the account that will be depositing
  /// @param amount The amount of the given token that will deposited
  /// @param deadline The last permitted block time for the signed deposit
  /// @param funderSignature An ERC20Permit signature from {funder} authorizing the transfer
  function deposit(ERC20Permit token, address funder, uint256 amount, uint256 deadline, bytes memory funderSignature) external;
}
