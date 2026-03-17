/**
 * Rotates a square image 90 degrees to the right.
 * The square is represented by a 4-bit number (0-15):
 * - Bit 8 (1000): Left edge
 * - Bit 4 (0100): Top edge
 * - Bit 2 (0010): Right edge
 * - Bit 1 (0001): Bottom edge
 * 
 * Example:
 * Input: 3 ("right,bottom" -> 0011)
 * Output: 9 ("bottom,left" -> 1001)
 * 
 * @param {number} x - The decimal representation of the lines (0-15).
 * @returns {number} The resulting number after a 90-degree right rotation.
 */
export const turn = (x) => ((x >> 1) | ((x & 1) << 3));

/**
 * Calculates the number of 90-degree right turns needed to transform 
 * the line pattern 'x' into the line pattern 'y'.
 * 
 * Returns -1 if it is impossible to reach 'y' from 'x' via rotation.
 * 
 * Example:
 * Input: x=14 (left,top,right -> 1110), y=7 (top,right,bottom -> 0111)
 * Output: 1 (one 90-degree turn)
 * 
 * Example:
 * Input: x=10 (left,right -> 1010), y=5 (top,bottom -> 0101)
 * Output: 1 (one 90-degree turn)
 * 
 * Example:
 * Input: x=1 (bottom -> 0001), y=2 (right -> 0010)
 * Output: 3 (three 90-degree turns: bottom -> left -> top -> right)
 * 
 * @param {number} x - The starting line pattern.
 * @param {number} y - The target line pattern.
 * @returns {number} Number of 90-degree right turns (0-3), or -1 if impossible.
 */
export const turns = (x, y) => {
    let currentX = x;
    for (let i = 0; i < 4; i++) {
        if (currentX === y) return i;
        currentX = turn(currentX);
    }
    return -1;
};
