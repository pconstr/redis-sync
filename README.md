redis-sync
==========

A [node.js](http://nodejs.org/) [redis](http://redis.io) [replication](http://redis.io/topics/replication) slave toolkit.

`redis-sync` implements the replication slave side of the `SYNC` command, streaming in all commands that modify the dataset.
It can also use [rdb-parser](https://github.com/pconstr/rdb-parser) to parse the dataset dump that precedes the commands.
If it can't connect, gets disconnected or if redis is still loading the dataset, `redis-sync` will keep trying to reconnect - with exponential backoff.

Installation
------------

`npm install redis-sync`

Usage
-----

```javascript
var redisSync = require('redis-sync');
var sync = new redisSync.Sync();

sync.on('command', function(command, args) {
  console.log('command', command, args);
});

sync.on('inlineCommand', function(buffers) {
  // the server sends regular PING commands
  console.log('inline command', buffers);
});

sync.on('error', function(err) {
  // listen to 'error' and rely on reconnection logic - otherwise it will get thrown
  console.error(err);
});

sync.connect();
```

Upon connection, the master will transfer the entire database in RDB format, before sending any commands.
`redis-sync` can use [rdb-parser](https://github.com/pconstr/rdb-parser) to parse it as it streams in.

You can listen to `entity` events on the `sync` object:

```javascript
sync.on('entity', function(e) {
  console.log(e);
});
```

or obtain the entity stream as it starts coming in

```javascript
sync.on('rdb', function(rdb) {
  rdb.on('entity', function(e) {
    console.log(e);
  });
  rdb.on('error', function(err) {
    // listen to 'error' and rely on reconnection logic - otherwise it will get thrown
    console.error(err);
  });
  rdb.on('end', function() {
    console.log('end of rdb');
  });
```

Note that in case of reconnection redis will send the database again, emitting 'rdb' and 'entity' events again on the same `sync` object.

License
-------

(The MIT License)

Copyright (c) 2011-2012 Carlos Guerreiro, [perceptiveconstructs.com](http://perceptiveconstructs.com)

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
