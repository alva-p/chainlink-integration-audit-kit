// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { TestBase } from "../../TestBase.sol";
import { Client } from "../libraries/Client.sol";
import { VulnerableCCIPReceiver } from "../vulnerable/VulnerableCCIPReceiver.sol";
import { FixedCCIPReceiver } from "../fixed/FixedCCIPReceiver.sol";

contract CCIPReceiverTest is TestBase {
    address private constant ROUTER = address(0x1000);
    address private constant TRUSTED_SENDER = address(0x2000);
    address private constant ATTACKER = address(0x3000);
    uint64 private constant TRUSTED_CHAIN = 16015286601757825753;

    function testVulnerableAcceptsSpoofedMessage() external {
        VulnerableCCIPReceiver receiver = new VulnerableCCIPReceiver();
        Client.Any2EVMMessage memory message = _message(ATTACKER, 999, address(this), 10 ether);

        receiver.ccipReceive(message);

        assertEq(receiver.lastSender(), ATTACKER);
        assertEq(receiver.creditedAmount(), 10 ether);
    }

    function testFixedRejectsWrongRouter() external {
        FixedCCIPReceiver receiver = new FixedCCIPReceiver(ROUTER, TRUSTED_CHAIN, TRUSTED_SENDER);
        Client.Any2EVMMessage memory message = _message(TRUSTED_SENDER, TRUSTED_CHAIN, address(this), 1);

        vm.expectRevert(FixedCCIPReceiver.InvalidRouter.selector);
        receiver.ccipReceive(message);
    }

    function testFixedRejectsWrongSender() external {
        FixedCCIPReceiver receiver = new FixedCCIPReceiver(ROUTER, TRUSTED_CHAIN, TRUSTED_SENDER);
        Client.Any2EVMMessage memory message = _message(ATTACKER, TRUSTED_CHAIN, address(this), 1);

        vm.prank(ROUTER);
        vm.expectRevert(FixedCCIPReceiver.InvalidSender.selector);
        receiver.ccipReceive(message);
    }

    function testFixedProcessesTrustedMessage() external {
        FixedCCIPReceiver receiver = new FixedCCIPReceiver(ROUTER, TRUSTED_CHAIN, TRUSTED_SENDER);
        Client.Any2EVMMessage memory message = _message(TRUSTED_SENDER, TRUSTED_CHAIN, address(0xBEEF), 42);

        vm.prank(ROUTER);
        receiver.ccipReceive(message);

        assertEq(receiver.lastAccount(), address(0xBEEF));
        assertEq(receiver.creditedAmount(), 42);
    }

    function _message(
        address sender,
        uint64 sourceChainSelector,
        address account,
        uint256 amount
    )
        private
        pure
        returns (Client.Any2EVMMessage memory message)
    {
        message = Client.Any2EVMMessage({
            messageId: bytes32(uint256(1)),
            sourceChainSelector: sourceChainSelector,
            sender: abi.encode(sender),
            data: abi.encode(account, amount),
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });
    }
}
