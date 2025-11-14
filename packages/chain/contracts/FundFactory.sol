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
  mapping(address => address[]) private _workerInstanceMap;
  /// @notice A local record of all the {IFund} proxies manufactured by this contract (by oracle)
  mapping(address => address[]) private _oracleInstanceMap;
  /// @notice Key list for {IFund} addresses in {_instanceMap}
  address[] private _instances;

  ////////////
  // Events //
  ////////////

  /// @notice Notification for when a new fund contract has been instantiated
  event Deploy(address indexed worker, address indexed oracle);

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

    address worker = IFund(proxy).worker();
    address oracle = IFund(proxy).oracle();
    _workerInstanceMap[worker].push(proxy);
    _oracleInstanceMap[oracle].push(proxy);
    _instances.push(proxy);

    emit Deploy(worker, oracle);
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

  /// @notice Accessor for a set of proxy contracts (indexed by role)
  /// @param account The address of the account for the proxy contracts to be returned
  /// @return The set of {account}'s proxy contract deployed through this factory
  function instances(address account, IFund.Role role) external view returns (address[] memory) {
    // TODO: Implement the expensive lookup for funders
    require(
      role == IFund.Role.Worker || role == IFund.Role.Oracle,
      "Factory instances can only currently be queried by worker or oracle"
    );

    if (role == IFund.Role.Worker) {
      return _workerInstanceMap[account];
    } else {
      return _oracleInstanceMap[account];
    }
  }
}
