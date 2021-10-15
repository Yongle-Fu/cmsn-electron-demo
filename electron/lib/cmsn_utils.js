const textDecoder = new TextDecoder('utf-8');

function isWin64() {
    return process.platform === 'win32' && (process.arch === 'x64' || Object.prototype.hasOwnProperty.call(process.env, 'PROCESSOR_ARCHITEW6432'));
}

function isElectron() {
    // Renderer process
    if (typeof window !== 'undefined' && typeof window.process === 'object' && window.process.type === 'renderer') {
        return true;
    }

    // Main process
    if (typeof process !== 'undefined' && typeof process.versions === 'object' && !!process.versions.electron) {
        return true;
    }

    // Detect the user agent when the `nodeIntegration` option is set to false
    if (typeof navigator === 'object' && typeof navigator.userAgent === 'string' && navigator.userAgent.indexOf('Electron') >= 0) {
        return true;
    }

    return false;
}

/**
 * hexToRGB
 * @description convert Hex string to RGB array
 * @param   {string} hexStr e.g. "#03F", "03F", "#0033FF", or "0033FF"
 * @throws  {error} convert failed
 * @returns {number[]} e.g. [ 0, 51, 255 ]
 */
function hexToRGB(hexStr) {
    // https://github.com/s-a/octo-space-wars/blob/master/js/game/color.js#L122
    const shorthandHexRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    const hexRegex = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;

    // Expand shorthand form (e.g. "#03F") to full form (e.g. "0033FF")
    const longHexStr = hexStr.replace(shorthandHexRegex, (m, r, g, b) => {
        return r + r + g + g + b + b;
    });

    // find each Hex of RGB
    const result = hexRegex.exec(longHexStr);
    if (result === null) {
        throw Error(`cannot convert hex string '${hexStr}' to RGB.`);
    }

    // convert Hex string to RGB array
    return [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
    ];
}

function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

function array_contains(array, obj) {
    var i = array.length;
    while (i--)
        if (array[i] === obj) return true;
    return false;
}

module.exports = {
    isWin64,
    isElectron,
    sleep,
    hexToRGB,
    textDecoder,
    array_contains,
};