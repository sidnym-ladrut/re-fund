// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Fund} from "./Fund.sol";

/// @title FundFactory
/// @notice TODO
/// @author ~sidnym-ladrut -- DM on Urbit for more details
contract FundFactory {
  ///////////////
  // Constants //
  ///////////////

  /// @notice TODO
  address public immutable FUND_IMPLEMENTATION;

  /////////////////////
  // State Variables //
  /////////////////////

  /// @notice TODO
  mapping(address => address[]) private _instanceMap;
  /// @notice TODO
  address[] private _instances;

  ///////////////
  // Functions //
  ///////////////

  /// @notice TODO
  constructor(address fundImplementation) {
    FUND_IMPLEMENTATION = fundImplementation;
  }

  /// @notice TODO
  function deploy(bytes calldata args) public returns (address) {
    return deploy(args, bytes32(uint256(0)));
  }

  /// @notice TODO
  function deploy(bytes calldata args, bytes32 salt) public returns (address) {
    address proxy = Clones.cloneDeterministic(FUND_IMPLEMENTATION, salt);
    Fund(proxy).initialize(msg.sender, args);

    _instanceMap[msg.sender].push(proxy);
    _instances.push(proxy);

    return proxy;
  }

  /// @notice TODO
  function instances() external view returns (address[] memory) {
    return _instances;
  }

  /// @notice TODO
  function instances(uint256 i) external view returns (address) {
    return _instances[i];
  }

  /// @notice TODO
  function instances(address owner) external view returns (address[] memory) {
    return _instanceMap[owner];
  }
}
