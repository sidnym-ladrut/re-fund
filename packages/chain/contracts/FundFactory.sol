// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IFund} from "./IFund.sol";

/// @title FundFactory
/// @notice A proxy factory for {IFund} contracts, which also serves as a directory for {IFund} instances
/// @author ~sidnym-ladrut -- DM on Urbit for more details
contract FundFactory {
  ///////////////
  // Constants //
  ///////////////

  /// @notice The base implementation contract for proxies created by this factory (see {IFund})
  IFund public immutable FUND_IMPLEMENTATION;

  /////////////////////
  // State Variables //
  /////////////////////

  /// @notice A local record of all the {IFund} proxies manufactured by this contract (by worker)
  mapping(address => address[]) private _instanceMap;
  /// @notice Key list for {IFund} addresses in {_instanceMap}
  address[] private _instances;

  ////////////
  // Events //
  ////////////

  /// @notice Notification for when a new fund contract has been instantiated
  event Deploy(address indexed worker);

  ///////////////
  // Functions //
  ///////////////

  /// @notice Constructs a factory to produce proxies for the given contract
  /// @param fundImplementation The implementation contract that will serve as the proxy template
  constructor(IFund fundImplementation) {
    FUND_IMPLEMENTATION = fundImplementation;
  }

  /// @notice Deploys a proxy for {FUND_IMPLEMENTATION}, returning its address
  /// @dev The deployment address is deterministically generated using {args}; for duplicate contracts, use {xref-FundFactory-deploy-bytes-bytes32-address}[deploy]
  /// @param args The encoded arguments that will be used to initialize the proxy
  /// @return proxy The address of the generated proxy contract
  function deploy(bytes calldata args) public returns (address proxy) {
    proxy = deploy(args, bytes32(uint256(0)));
  }

  /// @notice Deploys a proxy for {FUND_IMPLEMENTATION} (with a salt), returning its address
  /// @dev The deployment address is deterministically generated using {args} and {salt}
  /// @param args The encoded arguments that will be used to initialize the proxy
  /// @param salt A salt value to allow multiple contracts with the same arguments to be generated
  /// @return proxy The address of the generated proxy contract
  function deploy(bytes calldata args, bytes32 salt) public returns (address proxy) {
    bytes32 hash = bytes32(uint256(keccak256(args)) + uint256(salt));
    proxy = Clones.cloneDeterministic(address(FUND_IMPLEMENTATION), hash);
    IFund(proxy).initialize(args);

    // FIXME: Should probably be the worker set for this deployment instead
    _instanceMap[msg.sender].push(proxy);
    _instances.push(proxy);

    // FIXME: Should probably be the worker set for this deployment instead
    emit Deploy(msg.sender);
  }

  /// @notice Accessor for proxy contracts
  /// @return A list of all the proxy contracts deployed through this factory
  function instances() external view returns (address[] memory) {
    return _instances;
  }

  /// @notice Accessor for a proxy contract (indexed by order)
  /// @param i The index of the proxy contract to be returned
  /// @return The {i}th proxy contract deployed through this factory
  function instances(uint256 i) external view returns (address) {
    return _instances[i];
  }

  /// @notice Accessor for a set of proxy contracts (indexed by owner)
  /// @param owner The address of the owner for the proxy contracts to be returned
  /// @return The set of {owner}'s proxy contract deployed through this factory
  function instances(address owner) external view returns (address[] memory) {
    return _instanceMap[owner];
  }
}
