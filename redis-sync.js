/*jslint white: true, browser: true, plusplus: true, vars: true, nomen: true, bitwise: true*/

/* Copyright 2011-2012 Carlos Guerreiro
 * http://perceptiveconstructs.com
 * Licensed under the MIT license */

'use strict';

require("bufferjs");
var EventEmitter = require('events').EventEmitter;
var net = require('net');
var rdb = require('rdb-parser');
var util = require('util');

function Sync(parseRDB) {
  var state;
  var data, i;
  var unifiedNArg;
  var unifiedArgLen;
  var unifiedArg;
  var unifiedArgs;
  var bulkReplyLen;
  var inlineCommandBuffers;
  var inlineCommandStart;
  var bytesStart;
  var bytesLen;
  var bytesExpectingTail;
  var bytesCBData;
  var bytesCBEnd;
  var readRDB;
  var client;
  var port, host;
  var retryDelay;
  var initialRetryDelay = 250;
  var retryBackoff = 1.7;

  var that = this;

  function skipToCR() {
    while(i < data.length && data[i] !== 13) { // \r
      ++i;
    }
  }

  function parseNumToCr(v) {
    while(i < data.length && data[i] !== 13) { // \r
      v = 10 * v + (data[i++] - 48); // 48 = '0'
    }
    return v;
  }

  function startReadingBytes(len, expectingTail, cbData, cbEnd) {
    bytesLen = len;
    bytesStart = (i === data.length ? 0 : i);
    bytesExpectingTail = expectingTail;
    bytesCBData = cbData;
    bytesCBEnd = cbEnd;
    state = 'readBytes';
  }

  function error(err) {
    if(state !== 'error') {
      that.emit('error', err);
      state = 'error';
    }
  }

  function parseBuffer() {
    switch (state) {
    case 'ready':
      if (data[i] === 42) { // *
        state = 'unified';
        unifiedNArg = 0;
        unifiedArgs = [];
        ++i;
        break;
      } else if(data[i] === 36) { // $
        state = 'bulkReplyLen';
        ++i;
        bulkReplyLen = 0;
        break;
      } else if(data[i] === 10) { // redis sometimes writes a LF at the beginning of reply to SYNC
        ++i;
        state = 'ready';
      } else {
        state = 'inline';
        inlineCommandBuffers = [];
        inlineCommandStart = i;
        return;
      }
    case 'bulkReplyLen':
      bulkReplyLen = parseNumToCr(bulkReplyLen);
      if(i !== data.length) {
        ++i;
        state = 'bulkReplyLenR';
      }
      break;
    case 'bulkReplyLenR':
      if(data[i] === 10) { // \n
        ++i;
        if(parseRDB && !readRDB) {
          startReadingBytes(bulkReplyLen, false, function(buf) { that.rdb.write(buf); }, function() { that.rdb.end(); readRDB = true; connectedOK(); state = 'ready';});
        } else {
          startReadingBytes(bulkReplyLen, false, function(buf) { that.emit('bulkReplyData', buf); } , function() { that.emit('bulkReplyEnd'); readRDB = true; connectedOK(); state = 'ready';});
        }
      }
      break;
    case 'readBytes':
      var bytesEnd = bytesStart + bytesLen;
      var completed = false;
      if(bytesEnd > data.length) {
        bytesEnd = data.length;
      } else {
        completed = true;
      }
      bytesCBData(data.slice(bytesStart, bytesEnd));
      bytesLen = bytesLen - (bytesEnd - bytesStart);
      i = bytesEnd;
      if (completed) {
        if(bytesExpectingTail) {
          state = 'bytesTail';
        } else {
          bytesCBEnd();
        }
      } else {
        bytesStart = 0;
      }
      break;
    case 'bytesTail':
      if(data[i] === 13)  { // \r
        ++i;
        state = 'bytesTailR';
      } else {
        throw 'parsing error: expected CR after bytes';
      }
      break;
    case 'bytesTailR':
      if(data[i] === 10) { // \n
        ++i;
        bytesCBEnd();
      } else {
        throw 'parsing error: expecting LF after CR after bytes';
      }
      break;
    case 'unified':
      unifiedNArg = parseNumToCr(unifiedNArg);
      if(i !== data.length) {
        ++i;
        state = 'unifiedR';
      }
      break;
    case 'unifiedR':
      if(data[i] === 10) { // \n
        ++i;
        if(unifiedNArg > 0) {
          state = 'unifiedArg';
          unifiedArgs = [];
        } else {
          state = 'ready';
        }
      } else {
        throw 'parsing error: expected LF after CR after number of arguments';
      }
      break;
    case 'unifiedArg':
      if(data[i] === 36) { // $
        ++i;
        unifiedArgLen = 0;
        state = 'unifiedArgLen';
      } else {
        throw('parsing error: expected $ at start of argument');
      }
      break;
    case 'unifiedArgLen':
      unifiedArgLen = parseNumToCr(unifiedArgLen);
      if(i !== data.length) {
        ++i;
        state = 'unifiedArgLenR';
      }
      break;
    case 'unifiedArgLenR':
      if(data[i] === 10) { // \n
        ++i;
        unifiedArg = [];
        startReadingBytes(unifiedArgLen, true, function(buf) {
          unifiedArg.push(buf);
        }, function() {
          unifiedArgs.push(unifiedArg);
          --unifiedNArg;
          if(unifiedNArg > 0) {
            state = 'unifiedArg';
          } else {
            if(unifiedArgs.length > 0) {
              var command = Buffer.concat(unifiedArgs[0]).toString('ascii').toLowerCase();
              that.emit('command', command, unifiedArgs.slice(1));
            }
            state = 'ready';
          }
        });
      } else {
        throw 'parsing error: expected LF after CR at the end of unified arg len';
      }
      break;
    case 'inline':
      skipToCR();
      if(i != inlineCommandStart)
        inlineCommandBuffers.push(data.slice(inlineCommandStart, i));
      if(i === data.length) {
        inlineCommandStart = 0;
      } else {
        ++i;
        state = 'inlineR';
      }
      break;
    case 'inlineR':
      if(data[i] === 10) { // \n
        // check 1st char for error
        state = 'ready'; ++i;
        if(inlineCommandBuffers.length > 0 && inlineCommandBuffers[0][0] === '-'.charCodeAt(0)) {
          // retry sync after a while
          reconnect();
        } else {
          that.emit('inlineCommand', inlineCommandBuffers);
        }
      } else {
        throw 'parsing error: expected LF after CR at the end of inline command';
      }
      break;
    default:
      throw 'parsing error: unknown state';
    }
  }

  function parse(d) {
    data = d;
    i = 0;
    while(i < data.length) {
      parseBuffer();
    }
  }

  if(parseRDB)
    that.rdb = new rdb.Parser();

  function tryConnect() {
    console.error('tryConnect');
    var connId = Math.random();
    state = 'ready';
    readRDB = false;
    client = net.connect(port, host);
    client.on('connect', function(a) {
      client.write('sync\r\n');
    });

    client.on('data', function(data) {
      parse(data);
    });
    client.on('error', function(err) {
      reconnect();
    });
    client.on('end', function() {
      reconnect();
    });
  }

  function reconnect() {
    if(client) {
      client.removeAllListeners();
      client.destroy();
      client = undefined;
    }
    setTimeout(tryConnect, retryDelay);
    retryDelay = retryDelay * retryBackoff;
  }

  function connectedOK() {
    retryDelay = initialRetryDelay;
  }

  that.connect = function(p, h) {
    port = p; host = h;
    retryDelay = initialRetryDelay;
    if (port === undefined) {
      port = 6379;
    }
    tryConnect();
  };
}

util.inherits(Sync, EventEmitter);

exports.Sync = Sync;
exports.types = rdb.types;
