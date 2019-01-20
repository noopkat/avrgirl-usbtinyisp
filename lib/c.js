"use strict";

// thank you, @jacobrosenthal :raised_hands:
module.exports = {
  // Generic requests
  USBTINY_ECHO: 0, // 0x00: echo test
  USBTINY_READ: 1, // 0x01: read byte (wIndex:address)
  USBTINY_WRITE: 2, // 0x02: write byte (wIndex:address, wValue:value)
  USBTINY_CLR: 3, // 0x03: clear bit (wIndex:address, wValue:bitno)
  USBTINY_SET: 4, // 0x04: set bit (wIndex:address, wValue:bitno)

  // Programming requests
  USBTINY_POWERUP: 5, // 0x05: apply power (wValue:SCK-period, wIndex:RESET)
  USBTINY_POWERDOWN: 6, // 0x06: remove power from chip
  USBTINY_SPI: 7, // 0x07: issue SPI command (wValue:c1c0, wIndex:c3c2)
  USBTINY_POLL_BYTES: 8, // 0x08: set poll bytes for write (wValue:p1p2)
  USBTINY_FLASH_READ: 9, // 0x09: read flash (wIndex:address)
  USBTINY_FLASH_WRITE: 10, // 0x0A: write flash (wIndex:address, wValue:timeout)
  USBTINY_EEPROM_READ: 11, // 0x0B: read eeprom (wIndex:address)
  USBTINY_EEPROM_WRITE: 12, // 0x0C: write eeprom (wIndex:address, wValue:timeout)

  RESET_LOW: 0,
  RESET_HIGH: 1,
  SCK_MIN: 1,
  SCK_MAX: 250,
  SCK_DEFAULT: 10,
  CHUNK_SIZE: 128,
  USB_TIMEOUT: 500
};