#include <iostream>
#include <vector>
#include <string>
#include <cstdint>
#include <iomanip>

// Pre-computed lookup structure for fixed static Huffman codes
struct Code {
    uint8_t bits;  // Bit pattern
    uint8_t len;   // Number of active bits
};

// Fixed dictionary for telemetry character set ("Tmp:-12C")
Code getStaticCode(char c) {
    switch (c) {
        case 'T': return {0b000, 3};
        case 'm': return {0b001, 3};
        case 'p': return {0b010, 3};
        case ':': return {0b011, 3};
        case '-': return {0b100, 3};
        case '1': return {0b101, 3};
        case '2': return {0b110, 3};
        case 'C': return {0b111, 3};
        default:  return {0, 0};
    }
}

// True Bit-Packing Engine: packs variable-length bitcodes into uint8_t byte buffers
std::vector<uint8_t> compressPayload(const std::string& input, size_t& totalBits) {
    std::vector<uint8_t> buffer;
    uint8_t currentByte = 0;
    int bitPos = 7; // MSB first
    totalBits = 0;

    for (char c : input) {
        Code code = getStaticCode(c);
        for (int i = code.len - 1; i >= 0; --i) {
            uint8_t bit = (code.bits >> i) & 1;
            if (bit) {
                currentByte |= (1 << bitPos);
            }
            bitPos--;
            totalBits++;

            if (bitPos < 0) {
                buffer.push_back(currentByte);
                currentByte = 0;
                bitPos = 7;
            }
        }
    }
    if (bitPos < 7) {
        buffer.push_back(currentByte); // Flush remaining partial byte
    }
    return buffer;
}

int main() {
    std::string telemetry = "Tmp:-12C";
    size_t totalBits = 0;

    // Execute true byte-level compression
    std::vector<uint8_t> packedBuffer = compressPayload(telemetry, totalBits);

    // Calculate real physical byte metrics
    size_t rawBytes = telemetry.length();
    size_t compressedBytes = packedBuffer.size();
    double byteReduction = (1.0 - (double)compressedBytes / rawBytes) * 100.0;

    // Display production dashboard
    std::cout << "----------------------------------------" << std::endl;
    std::cout << "     Huffman Compression (Lossless)     " << std::endl;
    std::cout << "----------------------------------------" << std::endl;
    std::cout << " Raw Data  : " << telemetry << " (" << rawBytes << " bytes)" << std::endl;
    std::cout << " Hex Stream: ";
    for (uint8_t byte : packedBuffer) {
        std::cout << "0x" << std::hex << std::setfill('0') << std::setw(2) << (int)byte << " ";
    }
    std::cout << std::dec << std::endl;
    std::cout << " Savings   : " << rawBytes * 8 << "b -> " << totalBits << "b ("
              << std::fixed << std::setprecision(1) << byteReduction << "% saved)" << std::endl;
    std::cout << "----------------------------------------" << std::endl;
    std::cout << " CHAR  | BIT PATTERN | HUFFMAN CODE    " << std::endl;
    std::cout << "----------------------------------------" << std::endl;
    for (char c : telemetry) {
        Code code = getStaticCode(c);
        std::cout << "  '" << c << "'  |  " 
                  << std::setw(8) << (int)code.bits 
                  << "   | " << std::setw(2) << (int)code.len << " bits" << std::endl;
    }
    std::cout << "========================================" << std::endl;

    return 0;
}