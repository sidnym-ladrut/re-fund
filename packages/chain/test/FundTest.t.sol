// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {Fund} from "../contracts/Fund.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

// solc-ignore-next-line code-size
contract FundToken is ERC20, ERC20Permit {
  constructor() ERC20("Fund Token", "$fund") ERC20Permit("Fund Token") {
    _mint(msg.sender, 1e9 * 1e18);
  }
}

contract FundTest is Test {
  uint256 constant FUND_CUT = 1e3;
  bytes32 constant FUND_TERMS = bytes32(uint256(0));
  uint256 constant WORKER_PK = 1;
  uint256 constant ORACLE_PK = 2;
  uint256 constant FUNDER_PK = 3;

  Fund fund;
  ERC20Permit token;
  address worker;
  address oracle;
  address funder;


  function setUp() public {
    worker = vm.addr(WORKER_PK);
    oracle = vm.addr(ORACLE_PK);
    funder = vm.addr(FUNDER_PK);

    vm.prank(funder);
    token = new FundToken();

    vm.prank(worker);
    fund = new Fund(oracle, FUND_CUT, token, FUND_TERMS);
    vm.prank(worker);
  }


  function test_Constructor() public view {
    assertEq(fund.worker(), worker);
    assertEq(fund.worker(), fund.owner());
    assertEq(fund.oracle(), oracle);
  }

  function test_LockTerms_Success() public {
    bytes memory oracleTermsSignature = signAs(FUND_TERMS, ORACLE_PK);
    fund.lockTerms(oracleTermsSignature);
    assertEq(fund.termsSignature(), oracleTermsSignature);
  }

  function test_LockTerms_BadAuthor() public {
    bytes memory workerTermsSignature = signAs(FUND_TERMS, WORKER_PK);
    vm.expectRevert();
    fund.lockTerms(workerTermsSignature);
  }

  function test_LockTerms_BadMessage() public {
    bytes memory oracleRandomSignature = signAs(bytes32(uint256(1)), ORACLE_PK);
    vm.expectRevert();
    fund.lockTerms(oracleRandomSignature);
  }


  function signAs(bytes32 data, uint256 pk) private pure returns (bytes memory signature) {
    bytes32 hash = MessageHashUtils.toEthSignedMessageHash(data);
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, hash);
    return abi.encodePacked(r, s, v);
  }
}
