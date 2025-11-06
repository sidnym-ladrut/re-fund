# ERC20 Considerations

Instead of using a base `ERC20` interface (which requires 2-stage `approve` and
`transferFrom` from users), we'll use `ERC20Permit` instead.

This interface is implemented by the following popular `ERC20`s on Ethereum:

- USDC
- DAI
- Staked Ether

Notably, this interface is *not* implemented these other popular `ERC20`s:

- Tether
- ChainLink
- Wrapped Bitcoin
- Wrapped Ether
