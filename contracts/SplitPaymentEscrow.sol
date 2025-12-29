// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

contract SplitPaymentEscrow {
    enum State { AWAITING_PAYMENT, AWAITING_DELIVERY, COMPLETE }

    State public currentState;
    address public buyer;
    address payable[] public payees;
    uint[] public shares;
    uint public deadline;

    event Deposited(address indexed buyer, uint256 amount, uint256 timestamp);
    event DeliveryConfirmed(address indexed buyer, uint256 totalAmount);
    event Refunded(address indexed buyer, uint256 amount);


    constructor(address _buyer, address payable[] memory _payees, uint[] memory _shares, uint _daysUntilDeadline) {
        require(_payees.length == _shares.length, "Payees and shares length mismatch");
        require(_payees.length > 0, "No payees");

        uint totalShares = 0;
        for(uint i = 0; i < _shares.length; i++) {
            totalShares += _shares[i];
        }
        require(totalShares == 100, "Shares must equal 100");


        buyer = _buyer;
        payees = _payees;
        shares = _shares;
        currentState = State.AWAITING_PAYMENT;
        deadline = block.timestamp + (_daysUntilDeadline * 1 days);
    }

    modifier onlyBuyer() {
        require(msg.sender == buyer, "Only buyer can call this");
        _;
    }

    function deposit() external payable onlyBuyer {
        require(currentState == State.AWAITING_PAYMENT, "Already paid");
        require(msg.value > 0, "Must send ETH");
        currentState = State.AWAITING_DELIVERY;

        emit Deposited(msg.sender, msg.value, block.timestamp);
    }

    receive() external payable {
    revert("SplitPaymentEscrow: ETH must be sent via deposit()");
    }

    function confirmDelivery()  external onlyBuyer {
        require(currentState == State.AWAITING_DELIVERY, "Cannot confirm delivery");
        
        uint totalAmount = address(this).balance;
        for(uint i = 0; i < payees.length; i++) {
            uint payment = (totalAmount * shares[i]) / 100;
            (bool success, ) = payees[i].call{value: payment}("");
            require(success, "Transfer failed");
        }

        currentState = State.COMPLETE;
        
        emit DeliveryConfirmed(msg.sender, totalAmount);
    }

    function refund() external onlyBuyer {
        require(currentState == State.AWAITING_DELIVERY, "Cannot refund");
        require(block.timestamp > deadline, "Deadline not passed yet");
        require(address(this).balance > 0, "No funds to refund");
        
        uint256 totalAmount = address(this).balance;
        currentState = State.COMPLETE;
        
        (bool success, ) = buyer.call{value: totalAmount}("");
        require(success, "Refund failed");

        emit Refunded(msg.sender, totalAmount);
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

}