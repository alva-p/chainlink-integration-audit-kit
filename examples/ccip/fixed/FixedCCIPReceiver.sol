// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Client } from "../libraries/Client.sol";

contract FixedCCIPReceiver {
    error InvalidRouter();
    error InvalidSourceChain();
    error InvalidSender();

    address public immutable router;
    uint64 public immutable allowedSourceChainSelector;
    address public immutable allowedSender;

    address public lastAccount;
    uint256 public creditedAmount;

    constructor(address router_, uint64 allowedSourceChainSelector_, address allowedSender_) {
        router = router_;
        allowedSourceChainSelector = allowedSourceChainSelector_;
        allowedSender = allowedSender_;
    }

    function ccipReceive(Client.Any2EVMMessage calldata message) external {
        if (msg.sender != router) revert InvalidRouter();
        _ccipReceive(message);
    }

    function _ccipReceive(Client.Any2EVMMessage calldata message) internal {
        if (message.sourceChainSelector != allowedSourceChainSelector) {
            revert InvalidSourceChain();
        }

        address sender = abi.decode(message.sender, (address));
        if (sender != allowedSender) revert InvalidSender();

        (address account, uint256 amount) = abi.decode(message.data, (address, uint256));
        lastAccount = account;
        creditedAmount += amount;
    }
}
