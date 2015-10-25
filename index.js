var Writable = require('stream').Writable;
var domain = require('domain');
var util = require('util');
var elasticsearch = require('elasticsearch');
var moment = require('moment');

var levels = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal'
};

function generateIndexName (pattern, entry) {
  return moment.utc(entry.timestamp).format(pattern);
}

function callOrString (value, entry) {
  if (typeof(value) === 'function') {
    return value(entry);
  }
  return value;
}

function ElasticsearchStream (options) {
  options = options || {};
  this._client = options.client || new elasticsearch.Client(options);
  this._type = options.type || 'logs';
  var indexPattern = options.indexPattern || '[logstash-]YYYY.MM.DD';
  this._index = options.index || generateIndexName.bind(null, indexPattern); 
  Writable.call(this, options);
}

util.inherits(ElasticsearchStream, Writable);

ElasticsearchStream.prototype._write = function (entry, encoding, callback) {

  var client = this._client;
  var index = this._index;
  var type = this._type;
  entry = JSON.parse(entry.toString('utf8'));

  var d = domain.create();
  d.on('error', function (err) { 
    console.log("Elasticsearch Error", err.stack);
  });
  d.run(function () {
    var env = process.env.NODE_ENV || 'development';

    // Reassign these fields so them match what the default Kibana dashboard 
    // expects to see.
    entry['@timestamp'] = entry.time;
    entry.level = levels[entry.level];
    entry.message = entry.msg;
    entry.env = env;

    // remove duplicate fields
    delete entry.time;
    delete entry.msg;

    var datestamp = moment(entry.timestamp).format('YYYY.MM.DD');

    var options = {
      index: callOrString(index, entry),
      type: callOrString(type, entry),
      body: entry
    };

    client.create(options, function (err, resp) {
      if (err) console.log('Elasticsearch Stream Error:', err.stack);
      callback();
    });

  });
};

module.exports = ElasticsearchStream;
