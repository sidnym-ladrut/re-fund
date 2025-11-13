// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title IFund
/// @notice Interface for Fund contracts
/// @author ~sidnym-ladrut -- DM on Urbit for more details
interface IFund {
  ////////////
  // Events //
  ////////////

  /// @notice Notification for when tokens are deposited into the fund
  event Deposit(ERC20Permit indexed token, address indexed from, uint256 amount);
  /// @notice Notification for when tokens are withdrawn from the fund
  event Withdrawal(uint256 amount);
  /// @notice Notification for when a refund is issued
  event Refund(address indexed refunder, uint256 amount);

  ///////////////
  // Functions //
  ///////////////

  /// @notice Initializes a fund given a generic set of terms (see individual implementations for details)
  function initialize(bytes calldata args) external;

  /// @notice Interface for {OwnableUpgradeable.owner}
  function owner() external returns (address);
  /// @notice Interface for {OwnableUpgradeable.renounceOwnership}
  function renounceOwnership() external;
  /// @notice Interface for {OwnableUpgradeable.transferOwnership}
  function transferOwnership(address newOwner) external;
}
