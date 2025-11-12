// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {FundBaseTest} from "./FundBaseTest.sol";
import {Fund} from "../contracts/Fund.sol";

// solc-ignore-next-line code-size
contract FundFactoryTest is FundBaseTest {
  ///////////////
  // Constants //
  ///////////////

  bytes32 public constant FUND_BASE_TERMS = bytes32(uint256(1000));

  ///////////////
  // Modifiers //
  ///////////////

  modifier locked() {
    for (uint256 i = 0; i < _funds.length; i++) {
      bytes memory signature = _signAs191(_funds[i].oracle(), _funds[i].termsCID());
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

    for (uint256 i = 0; i < PERROLE_COUNT; i++) {
      bytes memory fundArgs = abi.encode(_workers[i], _oracles[i % 2], 0, _fundToken, bytes32(FUND_BASE_TERMS << i));
      vm.prank(_workers[i]);
      _funds.push(Fund(_fundFactory.deploy(fundArgs)));
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

  function test_deploy_initalize() public view {
    assertEq(_fundFactory.instances().length, PERROLE_COUNT);
    for (uint256 i = 0; i < PERROLE_COUNT; i++) {
      assertEq(Fund(_fundFactory.instances(i)).worker(), _workers[i]);
      assertEq(Fund(_fundFactory.instances(i)).oracle(), _oracles[i % 2]);
    }
  }

  function test_clone_independent() public locked {
    for (uint256 i = 0; i < PERROLE_COUNT; i++) {
      vm.prank(_funders[i]);
      _fundAs(_funds[i], _funders[i], (i + 1) * DEPO_AMOUNT);
    }

    bytes memory signature = _signAsRaw(_funds[0].oracle(), _funds[0].hashWithdraw(DEPO_AMOUNT));
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
