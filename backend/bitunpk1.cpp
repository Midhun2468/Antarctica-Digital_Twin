#include <iostream>
#include <vector>
#include <string>
#include <cstdint>

// Fixed Reverse Lookup Dictionary for Decoding
char decodeSymbol(uint8_t code) {
    switch (code) {
        case 0b000: return 'T';
        case 0b001: return 'm';
        case 0b010: return 'p';
        case 0b011: return ':';
        case 0b100: return '-';
        case 0b101: return '1';
        case 0b110: return '2';
        case 0b111: return 'C';
        default:    return '?';
    }
}

// Bit Unpacker / Decompressor
std::string decompressPayload(const std::vector<uint8_t>& buffer, size_t totalBits) {
    std::string result = "";
    uint8_t currentCode = 0;
    int codeLen = 0;
    size_t bitsRead = 0;

    for (uint8_t byte : buffer) {
        for (int i = 7; i >= 0; --i) {
            if (bitsRead >= totalBits) break;

            uint8_t bit = (byte >> i) & 1;
            currentCode = (currentCode << 1) | bit;
            codeLen++;

            if (codeLen == 3) { // Matches fixed 3-bit length
                result += decodeSymbol(currentCode);
                currentCode = 0;
                codeLen = 0;
            }
            bitsRead++;
        }
    }
    return result;
}

int main() {
    // 1. Raw byte buffer received from satellite Provider API
    std::vector<uint8_t> rxBuffer = {0x02, 0xb5, 0xdc}; 
    size_t totalBits = 18; // Included in packet header

    // 2. Decode bytes back to original sensor reading
    std::string telemetry = decompressPayload(rxBuffer, totalBits);

    std::cout << "Received Hex Payload : 0x02b5dc" << std::endl;
    std::cout << "Digital Twin Output  : " << telemetry << std::endl;

    return 0;
}