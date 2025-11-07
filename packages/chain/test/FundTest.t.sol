// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Fund} from "../contracts/Fund.sol";
// import {console} from "forge-std/console.sol";

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

string constant TOKEN_NAME = "Fund Token";
string constant TOKEN_SYMBOL = "$fund";
uint256 constant TOKEN_DECIMALS = 18;
uint256 constant TOKEN_COUNT = 1e9;
uint256 constant TOKEN_SUPPLY = 1e9 * 10 ** TOKEN_DECIMALS;

// solc-ignore-next-line code-size
contract FundToken is ERC20, ERC20Permit {
  bytes32 private constant PERMIT_TYPEHASH =
      keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

  constructor() ERC20(TOKEN_NAME, TOKEN_SYMBOL) ERC20Permit(TOKEN_NAME) {
    _mint(msg.sender, TOKEN_SUPPLY);
  }

  function hashPermit(
    address owner,
    address spender,
    uint256 value,
    uint256 deadline
  ) external virtual returns (bytes32) {
    bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonces(owner), deadline));
    bytes32 hash = _hashTypedDataV4(structHash);
    return hash;
  }
}

contract FundTest is Test {
  uint256 constant WORKER_PK = 1;
  uint256 constant ORACLE_PK = 2;
  uint256 constant FUNDER_PK = 3;

  uint256 constant FUND_CUT = 1e3;
  bytes32 constant FUND_TERMS = bytes32(uint256(100));
  bytes32 constant BAD_TERMS = bytes32(uint256(101));
  uint256 constant DEPO_AMOUNT = 1e1 * 10 ** TOKEN_DECIMALS;

  Fund fund;
  FundToken token;

  address worker;
  address oracle;
  address funder;

  //////////////////////
  // Set Up/Tear Down //
  //////////////////////

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

  modifier locked() {
    bytes memory signature = signAs191(FUND_TERMS, ORACLE_PK);
    fund.lockTerms(signature);
    _;
  }

  ////////////////////
  // Test Functions //
  ////////////////////

  function test_constructor() public view {
    assertEq(fund.worker(), worker);
    assertEq(fund.worker(), fund.owner());
    assertEq(fund.oracle(), oracle);
  }

  function test_lockTerms_success() public {
    bytes memory oracleTermsSignature = signAs191(FUND_TERMS, ORACLE_PK);
    fund.lockTerms(oracleTermsSignature);
    assertEq(fund.termsSignature(), oracleTermsSignature);
  }

  function test_lockTerms_badAuthor() public {
    bytes memory workerTermsSignature = signAs191(FUND_TERMS, WORKER_PK);
    vm.expectRevert();
    fund.lockTerms(workerTermsSignature);
  }

  function test_lockTerms_badMessage() public {
    bytes memory oracleRandomSignature = signAs191(BAD_TERMS, ORACLE_PK);
    vm.expectRevert();
    fund.lockTerms(oracleRandomSignature);
  }

  function test_lockTerms_postLock() public locked {
    bytes memory oracleTermsSignature = signAs191(FUND_TERMS, ORACLE_PK);
    vm.expectRevert();
    fund.lockTerms(oracleTermsSignature);
    vm.expectRevert();
    fund.updateTerms(oracle, FUND_CUT, token, BAD_TERMS);
  }

  function test_deposit_success() public locked {
    bytes32 permitHash = token.hashPermit(funder, address(fund), DEPO_AMOUNT, block.timestamp);
    bytes memory funderDepositSignature = signAsRaw(permitHash, FUNDER_PK);
    fund.deposit(token, funder, DEPO_AMOUNT, funderDepositSignature);
    assertEq(TOKEN_SUPPLY - DEPO_AMOUNT, token.balanceOf(funder));
  }

  function test_deposit_badPermit() public locked {
    bytes memory funderDepositSignature = signAsRaw(BAD_TERMS, FUNDER_PK);
    vm.expectRevert();
    fund.deposit(token, funder, DEPO_AMOUNT, funderDepositSignature);
  }

  //////////////////////
  // Helper Functions //
  //////////////////////

  function signAs191(bytes32 data, uint256 pk) private pure returns (bytes memory signature) {
    bytes32 hash = MessageHashUtils.toEthSignedMessageHash(data);
    return signAsRaw(hash, pk);
  }

  function signAsRaw(bytes32 data, uint256 pk) private pure returns (bytes memory signature) {
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, data);
    return abi.encodePacked(r, s, v);
  }
}
