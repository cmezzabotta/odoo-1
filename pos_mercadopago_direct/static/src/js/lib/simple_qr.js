/**
 * Minimal QR encoder based on https://github.com/kazuhikoarase/qrcode-generator (MIT License).
 * The implementation is trimmed down and exposed as a simple helper that renders the QR data
 * on a canvas element without polluting the global namespace.
 */

const QRMode = { MODE_8BIT_BYTE: 2 };
const QRErrorCorrectLevel = { L: 1, M: 0, Q: 3, H: 2 };

function QRPolynomial(num, shift) {
    if (num.length === undefined) throw new Error("QRPolynomial requires array");
    let offset = 0;
    while (offset < num.length && num[offset] === 0) {
        offset += 1;
    }
    this.num = new Array(num.length - offset + (shift || 0));
    for (let i = 0; i < num.length - offset; i++) {
        this.num[i] = num[i + offset];
    }
}

QRPolynomial.prototype = {
    get length() {
        return this.num.length;
    },
    get(i) {
        return this.num[i];
    },
    multiply(e) {
        const num = new Array(this.length + e.length - 1).fill(0);
        for (let i = 0; i < this.length; i++) {
            for (let j = 0; j < e.length; j++) {
                num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i)) + QRMath.glog(e.get(j)));
            }
        }
        return new QRPolynomial(num, 0);
    },
    mod(e) {
        if (this.length - e.length < 0) {
            return this;
        }
        const ratio = QRMath.glog(this.get(0)) - QRMath.glog(e.get(0));
        const num = this.num.slice();
        for (let i = 0; i < e.length; i++) {
            num[i] ^= QRMath.gexp(QRMath.glog(e.get(i)) + ratio);
        }
        return new QRPolynomial(num, 0).mod(e);
    },
};

const QRMath = {
    glog(n) {
        if (n < 1) throw new Error("glog(" + n + ")");
        return QRMath.LOG_TABLE[n];
    },
    gexp(n) {
        while (n < 0) {
            n += 255;
        }
        while (n >= 256) {
            n -= 255;
        }
        return QRMath.EXP_TABLE[n];
    },
    EXP_TABLE: new Array(256),
    LOG_TABLE: new Array(256),
};

for (let i = 0; i < 8; i++) {
    QRMath.EXP_TABLE[i] = 1 << i;
}
for (let i = 8; i < 256; i++) {
    QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4] ^ QRMath.EXP_TABLE[i - 5] ^ QRMath.EXP_TABLE[i - 6] ^ QRMath.EXP_TABLE[i - 8];
}
for (let i = 0; i < 255; i++) {
    QRMath.LOG_TABLE[QRMath.EXP_TABLE[i]] = i;
}

const QRUtil = {
    PATTERN_POSITION_TABLE: [
        [],
        [6, 18],
        [6, 22],
        [6, 26],
        [6, 30],
        [6, 34],
        [6, 22, 38],
        [6, 24, 42],
        [6, 26, 46],
        [6, 28, 50],
        [6, 30, 54],
        [6, 32, 58],
        [6, 34, 62],
        [6, 26, 46, 66],
        [6, 26, 48, 70],
    ],
    G15: (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | 1,
    G18: (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | 1,
    G15_MASK: (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1),
    getBCHTypeInfo(data) {
        let d = data << 10;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
            d ^= QRUtil.G15 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15));
        }
        return ((data << 10) | d) ^ QRUtil.G15_MASK;
    },
    getBCHTypeNumber(data) {
        let d = data << 12;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) >= 0) {
            d ^= QRUtil.G18 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18));
        }
        return (data << 12) | d;
    },
    getBCHDigit(data) {
        let digit = 0;
        while (data !== 0) {
            digit += 1;
            data >>>= 1;
        }
        return digit;
    },
    getPatternPosition(typeNumber) {
        return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1] || [];
    },
    getMask(maskPattern, i, j) {
        switch (maskPattern) {
            case 0:
                return (i + j) % 2 === 0;
            case 1:
                return i % 2 === 0;
            case 2:
                return j % 3 === 0;
            case 3:
                return (i + j) % 3 === 0;
            case 4:
                return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
            case 5:
                return ((i * j) % 2) + ((i * j) % 3) === 0;
            case 6:
                return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
            case 7:
                return (((i + j) % 2) + ((i * j) % 3)) % 2 === 0;
            default:
                throw new Error("bad maskPattern:" + maskPattern);
        }
    },
};

function QRBitBuffer() {
    this.buffer = [];
    this.length = 0;
}

QRBitBuffer.prototype = {
    get(index) {
        return ((this.buffer[Math.floor(index / 8)] >>> (7 - (index % 8))) & 1) === 1;
    },
    put(num, length) {
        for (let i = 0; i < length; i++) {
            this.putBit(((num >>> (length - i - 1)) & 1) === 1);
        }
    },
    putBit(bit) {
        const bufIndex = Math.floor(this.length / 8);
        if (this.buffer.length <= bufIndex) {
            this.buffer.push(0);
        }
        if (bit) {
            this.buffer[bufIndex] |= 0x80 >>> (this.length % 8);
        }
        this.length += 1;
    },
};

function QR8bitByte(data) {
    this.mode = QRMode.MODE_8BIT_BYTE;
    this.data = data;
}

QR8bitByte.prototype = {
    getLength() {
        return this.data.length;
    },
    write(buffer) {
        for (let i = 0; i < this.data.length; i++) {
            buffer.put(this.data.charCodeAt(i), 8);
        }
    },
};

const RS_BLOCK_TABLE = {
    // version 1 to 9 for L and M only (sufficient for payment strings)
    1: { L: [[1, 26, 19]], M: [[1, 26, 16]] },
    2: { L: [[1, 44, 34]], M: [[1, 44, 28]] },
    3: { L: [[1, 70, 55]], M: [[1, 70, 44]] },
    4: { L: [[1, 100, 80]], M: [[2, 50, 32]] },
    5: { L: [[1, 134, 108]], M: [[2, 67, 43]] },
    6: { L: [[2, 86, 68]], M: [[4, 43, 27]] },
    7: { L: [[2, 98, 78]], M: [[4, 49, 31]] },
    8: { L: [[2, 121, 97]], M: [[2, 60, 38], [2, 61, 39]] },
    9: { L: [[2, 146, 116]], M: [[3, 58, 36], [2, 59, 37]] },
    10: { L: [[2, 86, 68], [2, 87, 69]], M: [[4, 69, 43], [1, 70, 44]] },
};

function getRSBlocks(typeNumber, errorCorrectLevel) {
    const table = RS_BLOCK_TABLE[typeNumber];
    if (!table || !table[errorCorrectLevel]) {
        throw new Error("Unsupported QR version or correction level");
    }
    const rsBlock = table[errorCorrectLevel];
    const list = [];
    for (let i = 0; i < rsBlock.length; i++) {
        const block = rsBlock[i];
        const count = block[0];
        const total = block[1];
        const dataCount = block[2];
        for (let j = 0; j < count; j++) {
            list.push({ totalCount: total, dataCount });
        }
    }
    return list;
}

function createData(typeNumber, errorCorrectLevel, dataList) {
    const rsBlocks = getRSBlocks(typeNumber, errorCorrectLevel);
    const buffer = new QRBitBuffer();
    for (const data of dataList) {
        buffer.put(data.mode, 4);
        buffer.put(data.getLength(), 8);
        data.write(buffer);
    }
    let totalDataCount = 0;
    for (const block of rsBlocks) {
        totalDataCount += block.dataCount;
    }
    if (buffer.length > totalDataCount * 8) {
        throw new Error("code length overflow");
    }
    if (buffer.length + 4 <= totalDataCount * 8) {
        buffer.put(0, 4);
    }
    while (buffer.length % 8 !== 0) {
        buffer.putBit(false);
    }
    const data = new Array(totalDataCount).fill(0);
    for (let i = 0; i < buffer.length; i++) {
        data[Math.floor(i / 8)] |= (buffer.get(i) ? 1 : 0) << (7 - i % 8);
    }
    let index = buffer.length / 8;
    const PAD0 = 0xec;
    const PAD1 = 0x11;
    let padByte = true;
    while (index < totalDataCount) {
        data[index] = padByte ? PAD0 : PAD1;
        index += 1;
        padByte = !padByte;
    }
    const offset = 0;
    const maxDcCount = Math.max(...rsBlocks.map(block => block.dataCount));
    const maxEcCount = Math.max(...rsBlocks.map(block => block.totalCount - block.dataCount));
    const dcdata = new Array(rsBlocks.length);
    const ecdata = new Array(rsBlocks.length);
    let dataIndex = 0;
    for (let r = 0; r < rsBlocks.length; r++) {
        const dcCount = rsBlocks[r].dataCount;
        const ecCount = rsBlocks[r].totalCount - dcCount;
        dcdata[r] = new Array(dcCount);
        for (let i = 0; i < dcCount; i++) {
            dcdata[r][i] = data[dataIndex++];
        }
        const rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
        const rawPoly = new QRPolynomial(dcdata[r], rsPoly.length - 1);
        const modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.length - 1);
        for (let i = 0; i < rsPoly.length - 1; i++) {
            ecdata[r][i] = modPoly.get(i);
        }
    }
    const totalCodeCount = rsBlocks.reduce((acc, block) => acc + block.totalCount, 0);
    const output = new Array(totalCodeCount);
    let i = 0;
    for (let r = 0; r < maxDcCount; r++) {
        for (let b = 0; b < rsBlocks.length; b++) {
            if (r < dcdata[b].length) {
                output[i++] = dcdata[b][r];
            }
        }
    }
    for (let r = 0; r < maxEcCount; r++) {
        for (let b = 0; b < rsBlocks.length; b++) {
            if (r < ecdata[b].length) {
                output[i++] = ecdata[b][r];
            }
        }
    }
    return output;
}

QRUtil.getErrorCorrectPolynomial = function (errorCorrectLength) {
    let poly = new QRPolynomial([1], 0);
    for (let i = 0; i < errorCorrectLength; i++) {
        poly = poly.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0));
    }
    return poly;
};

function createBytes(buffer, rsBlocks) {
    const offset = 0;
    const maxDcCount = Math.max(...rsBlocks.map(block => block.dataCount));
    const maxEcCount = Math.max(...rsBlocks.map(block => block.totalCount - block.dataCount));
    const totalCodeCount = rsBlocks.reduce((acc, block) => acc + block.totalCount, 0);
    const output = new Array(totalCodeCount);
    let index = 0;
    for (let i = 0; i < maxDcCount; i++) {
        for (const block of rsBlocks) {
            if (i < block.dataCount) {
                output[index++] = buffer[offset + i + block.offset];
            }
        }
    }
    for (let i = 0; i < maxEcCount; i++) {
        for (const block of rsBlocks) {
            if (i < block.ecCount) {
                output[index++] = block.ec[i];
            }
        }
    }
    return output;
}

class QRCodeModel {
    constructor(typeNumber, errorCorrectLevel) {
        this.typeNumber = typeNumber;
        this.errorCorrectLevel = errorCorrectLevel;
        this.modules = null;
        this.moduleCount = 0;
        this.dataList = [];
        this.dataCache = null;
    }

    addData(data) {
        this.dataList.push(new QR8bitByte(data));
        this.dataCache = null;
    }

    isDark(row, col) {
        if (this.modules[row][col] !== null) {
            return this.modules[row][col];
        }
        return false;
    }

    getModuleCount() {
        return this.moduleCount;
    }

    make() {
        if (this.typeNumber < 1) {
            this.typeNumber = this._suggestTypeNumber();
        }
        this._makeImpl(false, this._getBestMaskPattern());
    }

    _suggestTypeNumber() {
        const length = this.dataList.reduce((acc, data) => acc + data.getLength(), 0);
        if (length <= 20) return 1;
        if (length <= 38) return 2;
        if (length <= 61) return 3;
        if (length <= 90) return 4;
        if (length <= 122) return 5;
        if (length <= 154) return 6;
        if (length <= 178) return 7;
        if (length <= 221) return 8;
        if (length <= 262) return 9;
        return 10;
    }

    _makeImpl(test, maskPattern) {
        this.moduleCount = this.typeNumber * 4 + 17;
        this.modules = new Array(this.moduleCount);
        for (let row = 0; row < this.moduleCount; row++) {
            this.modules[row] = new Array(this.moduleCount).fill(null);
        }
        this._setupPositionProbePattern(0, 0);
        this._setupPositionProbePattern(this.moduleCount - 7, 0);
        this._setupPositionProbePattern(0, this.moduleCount - 7);
        this._setupPositionAdjustPattern();
        this._setupTimingPattern();
        this._setupTypeInfo(test, maskPattern);
        if (this.typeNumber >= 7) {
            this._setupTypeNumber(test);
        }
        if (!this.dataCache) {
            const rsBlocks = getRSBlocks(this.typeNumber, this.errorCorrectLevel);
            const buffer = createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
            this.dataCache = buffer;
        }
        this._mapData(this.dataCache, maskPattern);
    }

    _setupPositionProbePattern(row, col) {
        for (let r = -1; r <= 7; r++) {
            if (row + r <= -1 || this.moduleCount <= row + r) continue;
            for (let c = -1; c <= 7; c++) {
                if (col + c <= -1 || this.moduleCount <= col + c) continue;
                if ((0 <= r && r <= 6 && (c === 0 || c === 6)) || (0 <= c && c <= 6 && (r === 0 || r === 6)) || (2 <= r && r <= 4 && 2 <= c && c <= 4)) {
                    this.modules[row + r][col + c] = true;
                } else {
                    this.modules[row + r][col + c] = false;
                }
            }
        }
    }

    _setupTimingPattern() {
        for (let r = 8; r < this.moduleCount - 8; r++) {
            if (this.modules[r][6] !== null) continue;
            this.modules[r][6] = r % 2 === 0;
        }
        for (let c = 8; c < this.moduleCount - 8; c++) {
            if (this.modules[6][c] !== null) continue;
            this.modules[6][c] = c % 2 === 0;
        }
    }

    _setupPositionAdjustPattern() {
        const pos = QRUtil.getPatternPosition(this.typeNumber);
        for (let i = 0; i < pos.length; i++) {
            for (let j = 0; j < pos.length; j++) {
                const row = pos[i];
                const col = pos[j];
                if (this.modules[row][col] !== null) continue;
                for (let r = -2; r <= 2; r++) {
                    for (let c = -2; c <= 2; c++) {
                        if (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) {
                            this.modules[row + r][col + c] = true;
                        } else {
                            this.modules[row + r][col + c] = false;
                        }
                    }
                }
            }
        }
    }

    _setupTypeNumber(test) {
        const bits = QRUtil.getBCHTypeNumber(this.typeNumber);
        for (let i = 0; i < 18; i++) {
            const mod = !test && ((bits >> i) & 1) === 1;
            this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod;
            this.modules[i % 3 + this.moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
        }
    }

    _setupTypeInfo(test, maskPattern) {
        const data = (QRErrorCorrectLevel.M << 3) | maskPattern;
        const bits = QRUtil.getBCHTypeInfo(data);
        for (let i = 0; i < 15; i++) {
            const mod = !test && ((bits >> i) & 1) === 1;
            if (i < 6) {
                this.modules[i][8] = mod;
            } else if (i < 8) {
                this.modules[i + 1][8] = mod;
            } else {
                this.modules[this.moduleCount - 15 + i][8] = mod;
            }
        }
        for (let i = 0; i < 15; i++) {
            const mod = !test && ((bits >> i) & 1) === 1;
            if (i < 8) {
                this.modules[8][this.moduleCount - i - 1] = mod;
            } else if (i < 9) {
                this.modules[8][15 - i - 1 + 1] = mod;
            } else {
                this.modules[8][15 - i - 1] = mod;
            }
        }
        this.modules[this.moduleCount - 8][8] = !test;
    }

    _mapData(data, maskPattern) {
        let inc = -1;
        let row = this.moduleCount - 1;
        let bitIndex = 7;
        let byteIndex = 0;
        for (let col = this.moduleCount - 1; col > 0; col -= 2) {
            if (col === 6) col -= 1;
            while (true) {
                for (let c = 0; c < 2; c++) {
                    if (this.modules[row][col - c] === null) {
                        let bit = false;
                        if (byteIndex < data.length) {
                            bit = ((data[byteIndex] >>> bitIndex) & 1) === 1;
                        }
                        const mask = QRUtil.getMask(maskPattern, row, col - c);
                        this.modules[row][col - c] = mask ? !bit : bit;
                        bitIndex -= 1;
                        if (bitIndex === -1) {
                            byteIndex += 1;
                            bitIndex = 7;
                        }
                    }
                }
                row += inc;
                if (row < 0 || this.moduleCount <= row) {
                    row -= inc;
                    inc = -inc;
                    break;
                }
            }
        }
    }

    _getBestMaskPattern() {
        let minLostPoint = 0;
        let pattern = 0;
        for (let i = 0; i < 8; i++) {
            this._makeImpl(true, i);
            const lostPoint = QRUtil.getLostPoint(this);
            if (i === 0 || minLostPoint > lostPoint) {
                minLostPoint = lostPoint;
                pattern = i;
            }
        }
        return pattern;
    }
}

QRUtil.getLostPoint = function (qrCode) {
    const moduleCount = qrCode.getModuleCount();
    let lostPoint = 0;
    for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
            let sameCount = 0;
            const dark = qrCode.isDark(row, col);
            for (let r = -1; r <= 1; r++) {
                if (row + r < 0 || moduleCount <= row + r) continue;
                for (let c = -1; c <= 1; c++) {
                    if (col + c < 0 || moduleCount <= col + c) continue;
                    if (r === 0 && c === 0) continue;
                    if (dark === qrCode.isDark(row + r, col + c)) sameCount += 1;
                }
            }
            if (sameCount > 5) {
                lostPoint += 3 + sameCount - 5;
            }
        }
    }
    for (let row = 0; row < moduleCount - 1; row++) {
        for (let col = 0; col < moduleCount - 1; col++) {
            let count = 0;
            if (qrCode.isDark(row, col)) count += 1;
            if (qrCode.isDark(row + 1, col)) count += 1;
            if (qrCode.isDark(row, col + 1)) count += 1;
            if (qrCode.isDark(row + 1, col + 1)) count += 1;
            if (count === 0 || count === 4) {
                lostPoint += 3;
            }
        }
    }
    for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount - 6; col++) {
            if (
                qrCode.isDark(row, col) &&
                !qrCode.isDark(row, col + 1) &&
                qrCode.isDark(row, col + 2) &&
                qrCode.isDark(row, col + 3) &&
                qrCode.isDark(row, col + 4) &&
                !qrCode.isDark(row, col + 5) &&
                qrCode.isDark(row, col + 6)
            ) {
                lostPoint += 40;
            }
        }
    }
    for (let col = 0; col < moduleCount; col++) {
        for (let row = 0; row < moduleCount - 6; row++) {
            if (
                qrCode.isDark(row, col) &&
                !qrCode.isDark(row + 1, col) &&
                qrCode.isDark(row + 2, col) &&
                qrCode.isDark(row + 3, col) &&
                qrCode.isDark(row + 4, col) &&
                !qrCode.isDark(row + 5, col) &&
                qrCode.isDark(row + 6, col)
            ) {
                lostPoint += 40;
            }
        }
    }
    let darkCount = 0;
    for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
            if (qrCode.isDark(row, col)) {
                darkCount += 1;
            }
        }
    }
    const ratio = Math.abs((100 * darkCount) / moduleCount / moduleCount - 50) / 5;
    lostPoint += ratio * 10;
    return lostPoint;
};

/**
 * Render the provided text as a QR code on the given canvas element.
 * @param {HTMLCanvasElement} canvas
 * @param {string} text
 * @param {number} size
 */
export function renderQrToCanvas(canvas, text, size = 256) {
    if (!canvas || !text) {
        return;
    }
    const qr = new QRCodeModel(0, "M");
    qr.addData(text);
    qr.make();
    const moduleCount = qr.getModuleCount();
    const canvasSize = size;
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvasSize, canvasSize);
    const tileW = canvasSize / moduleCount;
    const tileH = canvasSize / moduleCount;
    ctx.fillStyle = "#000000";
    for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
            if (qr.isDark(row, col)) {
                const w = Math.ceil((col + 1) * tileW) - Math.floor(col * tileW);
                const h = Math.ceil((row + 1) * tileH) - Math.floor(row * tileH);
                ctx.fillRect(Math.round(col * tileW), Math.round(row * tileH), w, h);
            }
        }
    }
}

