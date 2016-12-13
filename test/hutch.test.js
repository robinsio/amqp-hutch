var mocha   = require('mocha');
var should  = require('chai').should();

var AMQPHutch = require('..');

describe('Hutch', function() {

  it('isConnected should return true when hutch is connected', function(complete) {
    var hutch = new AMQPHutch();

    hutch.initialise({
      connectionString: 'amqp://localhost',
      retryWait:        100000
    });

    hutch.on('ready', function(){
      hutch.isConnected().should.equal(true);
      complete();
    })
  });

  it('isConnected should return false when hutch is not connected', function(complete) {
    var hutch = new AMQPHutch();
    hutch.isConnected().should.equal(false);
    complete();
  });

  it('should return a no channel error when attempting to close a channel that doesnt exist', function(complete) {
    var hutch = new AMQPHutch();

    hutch.initialise({
      connectionString: 'amqp://localhost',
      retryWait:        100000
    });

    hutch.on('ready', function(){
      hutch.close("not/going/to/exist", function(err){
        err.name.should.equal('NoChannelError');
        complete();
      })
    })
  });

  it('should bind and consumer a message', function(complete) {

    var hutch = new AMQPHutch();

    hutch.initialise({
      connectionString: 'amqp://localhost',
      retryWait:        100
    });

    hutch.on('ready', function() {

      var options = {
        exchange: {
          name: 'example.exchange.1',
          type: 'topic'
        },
        queue: {
          name: 'example.queue',
          prefetch: 1,
          durable:  true
        },
        publish: {
          persistent: true,
          expiration: 86400000
        }
      };

      var consumer = function(message, done, fail) {
        JSON.parse(message.content).should.equal('Example Message!');
        done();

        hutch.close(options.queue.name, function(){
          complete();
        });
      };

      hutch.consume(options, consumer, function(err) {
        hutch.publish(options, "Example Message!", function(err, res){});
      });
    });
  });

  it('should error when not connected', function(complete) {
    this.timeout(5000); // Allow up to 5 seconds for windows

    var hutch = new AMQPHutch();

    hutch.initialise({
      connectionString: 'amqp://bad',
      retryWait:        100000
    });

    hutch.on('error', function(err) {
      complete();
    });
  });

  it('should destroy a queue', function(complete) {

    var hutch = new AMQPHutch();

    hutch.initialise({
      connectionString: 'amqp://localhost',
      retryWait:        100
    });

    hutch.on('ready', function() {

      var options = {
        exchange: {
          name: 'example.exchange.2',
          type: 'topic'
        },
        queue: {
          name: 'example.queue.1',
          prefetch: 1,
          durable:  true
        },
        publish: {
          persistent: true,
          expiration: 86400000
        }
      };

      var consumer = function(message, done, fail) {
        hutch.destroy(options.queue.name, options.exchange.name, function(err){
          should.not.exist(err);
          complete();
        });
      };

      hutch.consume(options, consumer, function(err) {
        hutch.publish(options, "Example Message!", function(err, res){});
      });
    });
  });

  it('should trigger a closeChannel event with the queue name for the channel', function(complete) {

    var hutch = new AMQPHutch();

    hutch.initialise({
      connectionString: 'amqp://localhost',
      retryWait:        100
    });

    hutch.on('ready', function() {

      var options = {
        exchange: {
          name: 'example.exchange.2',
          type: 'topic'
        },
        queue: {
          name: 'example.queue.1',
          prefetch: 1,
          durable:  true
        },
        publish: {
          persistent: true,
          expiration: 86400000
        }
      };

      var consumer = function(message, done, fail) {
        hutch.close(options.queue.name, function(err){});
      };

      hutch.consume(options, consumer, function(err) {
        hutch.publish(options, "Example Message!", function(err, res){});
      });
    });

    hutch.on('channelClosed', function(queue){
      queue.should.equal('example.queue.1');
      complete();
    });
  });

  it('should error when one instance of hutch tries to consumer against the same queue', function(complete) {

    var hutch = new AMQPHutch();

    hutch.initialise({
      connectionString: 'amqp://localhost',
      retryWait:        100
    });

    hutch.on('ready', function() {

      var consumer = function(message, done, fail) {done();};

      var options = {
        exchange: {
          name: 'example.exchange.1',
          type: 'topic'
        },
        queue: {
          name: 'example.queue',
          prefetch: 1,
          durable:  true
        },
        publish: {
          persistent: true,
          expiration: 86400000
        }
      };

      hutch.consume(options, consumer, function(err) {
        hutch.consume(options, consumer, function(err) {
          err.name.should.equal('ChannelAlreadyExists');

          hutch.close(options.queue.name, function(){
            complete();
          });
        });
      });
    });
  });

  it('should retry for exclusive consumer after consumer one goes down', function(complete) {

    this.timeout(20000); // Allow up to 15 seconds for windows

    var config = {
      connectionString: 'amqp://localhost',
      retryWait:        100
    };

    var options = {
      exchange: {
        name: 'example.exchange.1',
        type: 'topic'
      },
      queue: {
        name: 'example.queue',
        prefetch: 1,
        durable:  true
      },
      publish: {
        persistent: true,
        expiration: 86400000
      },
      exclusive: true
    };

    var consumer = function(message, done, fail) { done(); };

    var instance1 = new AMQPHutch();
    var instance2 = new AMQPHutch();

    instance1.initialise(config);
    instance2.initialise(config);

    instance1.on('ready', function() {

      console.log("Hutch Instance Ready")

      instance1.consume(options, consumer, function(err) {
        console.log("Setup Consumer 1");

        instance2.consume(options, consumer, function(err) {
          console.log("Setup Consumer 2");
          should.not.exist(err);

          instance1.close(options.queue.name, function(){
            instance2.close(options.queue.name, function(){ complete(); });
          });
        });

        setTimeout(function(){
          instance1.close(options.queue.name, function(){
            // This will trigger consumer 2 to start
            console.log("Shutting down Consumer 1");
          })
        }, 4000)
      });
    });
  });
});
