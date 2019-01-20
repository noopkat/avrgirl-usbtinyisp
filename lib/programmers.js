'use strict';

// this is most useless, it turns out sf borrows Adafruit's pid and vid
// imma still keep it for now
module.exports = {
  'sf-pocket-avr': {
    pid: '3231',
    vid: '6017',
    loris: false
  },
  'sf-tiny-avr': {
    pid: '3231',
    vid: '6017',
    loris: false
  },
  'adafruit-avr': {
    pid: '3231',
    vid: '6017',
    loris: false
  },
  'trinket': {
    pid: '3231',
    vid: '6017',
    loris: true
  },
  'gemma2': {
    pid: '3231',
    vid: '6017',
    loris: true
  },
  'gemma': {
    pid: '3231',
    vid: '9025',
    loris: true
  }
};