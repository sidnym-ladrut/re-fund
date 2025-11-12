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
      bytes32 fundTerms = bytes32(FUND_BASE_TERMS << i);
      bytes memory fundArgs = abi.encode(_oracles[i % 2], FUND_CUT, _fundToken, fundTerms);

      vm.prank(_workers[i]);
      _funds.push(Fund(_fundFactory.deploy(fundArgs)));
    }
  }

  ////////////////////
  // Test Functions //
  ////////////////////

  function test_deploy_implementation() public {
    assertEq(_fundImplementation.owner(), address(0));

    bytes memory fundArgs = abi.encode(_oracles[0], FUND_CUT, _fundToken, FUND_BASE_TERMS);
    vm.prank(_workers[0]);
    vm.expectRevert();
    _fundImplementation.initialize(_launcher, fundArgs);
  }

  function test_deploy_success() public view {
    assertEq(_fundFactory.instances().length, PERROLE_COUNT);
    for (uint256 i = 0; i < PERROLE_COUNT; i++) {
      assertEq(Fund(_fundFactory.instances(i)).worker(), _workers[i]);
    }
  }
}
