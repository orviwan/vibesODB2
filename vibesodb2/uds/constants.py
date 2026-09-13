"""
UDS (ISO 14229-1) protocol constants, Service IDs, Negative Response Codes,
and VAG standard Data Identifiers (DIDs).
"""

# UDS Service Identifiers (SID)
SID_DIAGNOSTIC_SESSION_CONTROL = 0x10
SID_ECU_RESET = 0x11
SID_CLEAR_DIAGNOSTIC_INFORMATION = 0x14
SID_READ_DTC_INFORMATION = 0x19
SID_READ_DATA_BY_IDENTIFIER = 0x22
SID_SECURITY_ACCESS = 0x27
SID_WRITE_DATA_BY_IDENTIFIER = 0x2E
SID_TESTER_PRESENT = 0x3E
SID_NEGATIVE_RESPONSE = 0x7F

# Positive response offset: SID + 0x40
POS_RESP_OFFSET = 0x40

# Diagnostic Sessions
SESSION_DEFAULT = 0x01
SESSION_PROGRAMMING = 0x02
SESSION_EXTENDED = 0x03
SESSION_SAFETY_SYSTEM = 0x04

# Negative Response Codes (NRC)
NRC_MAP = {
    0x10: "General Reject",
    0x11: "Service Not Supported",
    0x12: "Sub-function Not Supported",
    0x13: "Incorrect Message Length Or Invalid Format",
    0x14: "Response Too Long",
    0x21: "Busy - Repeat Request",
    0x22: "Conditions Not Correct",
    0x24: "Request Sequence Error",
    0x25: "No Response From Subnet Component",
    0x26: "Failure Prevents Execution Of Requested Action",
    0x31: "Request Out Of Range",
    0x33: "Security Access Denied",
    0x35: "Invalid Key",
    0x36: "Exceed Number Of Attempts",
    0x37: "Required Time Delay Not Expired",
    0x70: "Upload Download Not Accepted",
    0x71: "Transfer Data Suspended",
    0x72: "General Programming Failure",
    0x73: "Wrong Block Sequence Counter",
    0x78: "Request Correctly Received - Response Pending",
    0x7E: "Sub-function Not Supported In Active Session",
    0x7F: "Service Not Supported In Active Session",
}

# Standard VAG Data Identifiers (DID)
DID_BCM_LONG_CODING = 0x0600
DID_CLUSTER_LONG_CODING_1 = 0x0600
DID_CLUSTER_LONG_CODING_2 = 0x2203
DID_VIN = 0xF190
DID_ECU_HARDWARE_NUMBER = 0xF191
DID_ECU_SOFTWARE_VERSION = 0xF189
