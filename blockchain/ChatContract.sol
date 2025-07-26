
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract ChatContract {
    struct MessageRecord {
        string messageId;
        string contentHash;
        address sender;
        uint256 timestamp;
        bool exists;
    }

    mapping(string => MessageRecord) public messages;
    mapping(address => string[]) public userMessages;

    event MessageRecorded(string indexed messageId, string contentHash, address indexed sender, uint256 timestamp);

    function recordMessage(
        string calldata messageId,
        string calldata contentHash,
        uint256 timestamp
    ) external {
        require(!messages[messageId].exists, "Message already exists");
        require(bytes(messageId).length > 0, "Message ID cannot be empty");
        require(bytes(contentHash).length > 0, "Content hash cannot be empty");

        messages[messageId] = MessageRecord({
            messageId: messageId,
            contentHash: contentHash,
            sender: msg.sender,
            timestamp: timestamp,
            exists: true
        });

        userMessages[msg.sender].push(messageId);
        emit MessageRecorded(messageId, contentHash, msg.sender, timestamp);
    }

    function getMessageRecord(string calldata messageId) external view returns (
        string memory contentHash,
        address sender,
        uint256 timestamp
    ) {
        require(messages[messageId].exists, "Message does not exist");

        MessageRecord storage message = messages[messageId];
        return (message.contentHash, message.sender, message.timestamp);
    }

    function getUserMessages(address user) external view returns (string[] memory) {
        return userMessages[user];
    }

    function verifyMessage(string calldata messageId, string calldata contentHash) external view returns (bool) {
        if (!messages[messageId].exists) {
            return false;
        }
        return keccak256(abi.encodePacked(messages[messageId].contentHash)) == keccak256(abi.encodePacked(contentHash));
    }

    function messageExists(string calldata messageId) external view returns (bool) {
        return messages[messageId].exists;
    }
}
