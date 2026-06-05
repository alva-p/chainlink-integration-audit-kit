// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Client } from "../libraries/Client.sol";

contract VulnerableCCIPReceiver {
    address public lastSender;
    uint64 public lastSourceChainSelector;
    uint256 public creditedAmount;

    function ccipReceive(Client.Any2EVMMessage calldata message) external {
        _ccipReceive(message);
    }

    function _ccipReceive(Client.Any2EVMMessage calldata message) internal {
        (address account, uint256 amount) = abi.decode(message.data, (address, uint256));
        lastSender = abi.decode(message.sender, (address));
        lastSourceChainSelector = message.sourceChainSelector;
        creditedAmount += amount;
        account;
    }
}
