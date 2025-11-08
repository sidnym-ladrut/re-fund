# `re-fund` Work

The work items within each section are broadly sorted from most to least
critical.

## User Interface

1. Add basic flow of launching campaigns, signing terms, and funding projects
   1. *Worker*: store terms on IPFS, launch `fund` contract, perform
      `withdrawal`, perform `refund`
   2. *Oracle*: view terms on IPFS, sign `fund` contract, sign `withdrawal`,
      perform `refund`
   3. *Funder*: view a given `fund`, deposit into a `fund`
2. Add caching support to the FE using `react-query` or similar
3. Stylize and improve look and feel of all forms

## Contracts

### Functionality

1. Add support for initialization from a deployer/factory to enable centralized
   querying/bookkeeping (e.g. this wallet owns these funds)
2. Use Uniswap on withdrawal to put all donation currencies into the payout
   currency
3. Add support for ERC20 tokens that aren't ERC20Permit compliant (e.g. Tether)
4. Use ChainLink oracle to price all donation currencies in the payout currency
   on refund

### Testing

1. Run smart contract security audit using multiple tools (e.g. `slither`)
2. Extend testing to include fuzz tests
3. Extend testing to encompass more complete edge case tests
