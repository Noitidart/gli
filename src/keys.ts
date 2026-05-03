export const BYTE_CTRL_B = 0x02
export const BYTE_CTRL_C = 0x03
export const BYTE_CTRL_F = 0x06
export const BYTE_CTRL_R = 0x12
export const BYTE_ENTER = 0x0d
export const BYTE_ESCAPE = 0x1b
export const BYTE_SPACE = 0x20
export const BYTE_c = 0x63
export const BYTE_g = 0x67
export const BYTE_G = 0x47
export const BYTE_h = 0x68
export const BYTE_i = 0x69
export const BYTE_j = 0x6a
export const BYTE_k = 0x6b
export const BYTE_l = 0x6c
export const BYTE_o = 0x6f
export const BYTE_q = 0x71
export const BYTE_y = 0x79
export const BYTE_z = 0x7a
export const BYTE_u = 0x75
export const BYTE_a = 0x61

const DIGIT_0 = 0x30
const DIGIT_9 = 0x39

export function isDigit(byte: number): boolean {
  return byte >= DIGIT_0 && byte <= DIGIT_9
}

export function digitValue(byte: number): number {
  return byte - DIGIT_0
}
