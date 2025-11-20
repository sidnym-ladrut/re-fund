// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

// import {console} from "forge-std/console.sol";
import {FundBaseTest} from "./FundBaseTest.sol";
import {Fund} from "../contracts/Fund.sol";
import {IFund} from "../contracts/IFund.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

// solc-ignore-next-line code-size
contract FundFactoryTest is FundBaseTest {
  ///////////////
  // Constants //
  ///////////////

  string public constant FUND_BASE_TERMS = "QmNezRZBYa6EZjx7346rvGmUhxPocNqEpP7YvpdYmytbW";

  /////////////////////
  // State Variables //
  /////////////////////

  /// @dev This is a test reference variable that needs to be a state variable because of Solidity's
  /// constraints on function scope variable types
  address[][] private _oracleContractsMap;

  ///////////////
  // Modifiers //
  ///////////////

  modifier locked() {
    for (uint256 i = 0; i < _funds.length; i++) {
      bytes memory signature = _signAs(_funds[i].oracle(), _funds[i].hashSignTerms());
      vm.prank(_funds[i].worker());
      _funds[i].lockTerms(signature);
    }
    _;
  }

  //////////////////////
  // Set Up/Tear Down //
  //////////////////////

  function setUp() public override {
    super.setUp();

    _oracleContractsMap = new address[][](0);
    for (uint256 i = 0; i < PERROLE_COUNT; i++) {
      string memory fundTerms = string.concat(FUND_BASE_TERMS, Strings.toHexString(i));
      bytes memory fundArgs = abi.encode(_workers[i], _oracles[i % 2], 0, _fundToken, fundTerms);
      vm.prank(_workers[i]);
      Fund fundContract = Fund(_fundFactory.deploy(fundArgs));

      _funds.push(fundContract);
      _oracleContractsMap.push(new address[](0));
      _oracleContractsMap[i % 2].push(address(fundContract));
    }
  }

  ////////////////////
  // Test Functions //
  ////////////////////

  function test_deploy_implementation() public {
    assertEq(_fundImplementation.owner(), _launcher);

    bytes memory fundArgs = abi.encode(_launcher, _launcher, FUND_CUT, _fundToken, bytes32(uint256(0)));
    vm.prank(_launcher);
    vm.expectRevert();
    _fundImplementation.initialize(fundArgs);
  }

  function test_deploy_initalize() public {
    assertEq(_fundFactory.instances().length, PERROLE_COUNT);

    for (uint256 i = 0; i < PERROLE_COUNT; i++) {
      Fund fundContract = Fund(_fundFactory.instances(i));
      assertEq(fundContract.worker(), _workers[i]);
      assertEq(fundContract.oracle(), _oracles[i % 2]);
    }

    for (uint256 i = 0; i < PERROLE_COUNT; i++) {
      address[] memory workerContracts = _fundFactory.instances(_workers[i], IFund.Role.Worker);
      assertEq(workerContracts.length, 1);
      assertEq(workerContracts[0], _fundFactory.instances(i));
    }

    for (uint256 i = 0; i < PERROLE_COUNT; i++) {
      address[] memory oracleContracts = _fundFactory.instances(_oracles[i], IFund.Role.Oracle);
      assertEq(oracleContracts, _oracleContractsMap[i]);
    }
  }

  function test_clone_independent() public locked {
    for (uint256 i = 0; i < PERROLE_COUNT; i++) {
      vm.prank(_funders[i]);
      _fundAs(_funds[i], _funders[i], (i + 1) * DEPO_AMOUNT);
    }

    bytes memory signature = _signAs(_funds[0].oracle(), _funds[0].hashWithdraw(DEPO_AMOUNT));
    vm.prank(_workers[0]);
    _funds[0].withdraw(DEPO_AMOUNT, signature);

    assertEq(_fundToken.balanceOf(_workers[0]), DEPO_AMOUNT);
    assertEq(_fundToken.balanceOf(address(_funds[0])), 0);
    for (uint256 i = 1; i < PERROLE_COUNT; i++) {
      assertEq(_fundToken.balanceOf(_workers[i]), 0);
      assertEq(_fundToken.balanceOf(address(_funds[i])), (i + 1) * DEPO_AMOUNT);
    }
  }
}
