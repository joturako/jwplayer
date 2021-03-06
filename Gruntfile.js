'use strict';

/* eslint-env node *w/
/* eslint no-process-env: 0 */

var webpack = require('webpack');
var webpackConfigs = require('./webpack.config');
var webpackCompilers = {};
var env = process.env;
var execSync = require('child_process').execSync;

function getBuildVersion(packageInfo) {
    // Build Version: {major.minor.revision}
    var metadata = '';
    if (env.BUILD_NUMBER) {
        var branch = env.GIT_BRANCH;
        metadata = 'opensource';
        if (branch) {
            metadata += '_' + branch.replace(/^origin\//, '').replace(/[^0-9A-Za-z-]/g, '-');
        }
        metadata += '.' + env.BUILD_NUMBER;
    } else {
        var now = new Date();
        now.setTime(now.getTime()-now.getTimezoneOffset()*60000);
        metadata = 'local.' + now.toISOString().replace(/[\.\-:T]/g, '-').replace(/Z|\.\d/g, '');
    }
    return packageInfo.version +'+'+ metadata;
}

module.exports = function(grunt) {

    require('load-grunt-tasks')(grunt);

    var packageInfo = grunt.file.readJSON('package.json');
    var buildVersion = getBuildVersion(packageInfo);

    // For task testing
    // grunt.loadTasks('../grunt-flash-compiler/tasks');

    console.log('%s v%s', packageInfo.name, buildVersion);

    grunt.initConfig({
        starttime: new Date(),
        pkg: packageInfo,

        stylelint: {
            options: {
                configFile: '.stylelintrc',
                formatter: 'string',
                ignoreDisables: false,
                failOnError: true,
                reportNeedlessDisables: false,
                syntax: 'less'
            },
            src: [
                'src/**/*.less'
            ]
        },

        less: {
            options: {
                compress: false,
                paths: ['src/css', 'src/css/*']
            },
            internal: {
                options: {
                    dumpLineNumbers: 'comments'
                },
                files: {
                    'bin-debug/reference/jwplayer.css': 'src/css/jwplayer.less',
                    'bin-debug/reference/controls.css': 'src/css/controls.less'
                }
            },
            debug: {
                options: {
                    dumpLineNumbers: 'comments'
                },
                files: [{
                    expand: true,
                    ext: '.css',
                    dest: 'bin-debug/skins/',
                    cwd: 'src/css/skins/',
                    src: '*.less'
                }]
            },
            release: {
                options: {
                    compress: true
                },
                files: [{
                    expand: true,
                    ext: '.css',
                    dest: 'bin-release/skins/',
                    cwd: 'src/css/skins/',
                    src: '*.less'
                }]
            }
        },

        postcss: {
            options: {
                processors: [
                    require('autoprefixer')
                ],
                failOnError: true,
                writeDest: true
            },
            internal: {
                src: [
                    'bin-debug/reference/*.css',
                    'bin-debug/skins/*.css',
                ]
            },
            debug: {
                src: [
                    'bin-debug/reference/*.css',
                    'bin-debug/skins/*.css',
                    'bin-release/skins/*.css'
                ]
            },
            release: {
                src: [
                    'bin-release/skins/*.css'
                ]
            }
        },

        watch : {
            options: {
                interrupt: false,
                spawn: false,
                debounceDelay: 3000,
                livereload: true,
                event: ['added', 'changed'],
                dateFormat: function(time) {
                    grunt.log.writeln('Updated in ' + (time / 1000).toFixed(3) + 's at ' + (new Date()).toISOString());
                }
            },
            player: {
                options: {
                    atBegin: true
                },
                files : ['src/js/**/*.js'],
                tasks: ['webpack:debug', 'lint:player', 'karma:local']
            },
            css: {
                files: ['src/css/{,*/}*.less'],
                tasks: ['stylelint', 'webpack:debug', 'less:debug', 'postcss:debug']
            },
            tests: {
                files : ['test/{,*/}*.js'],
                tasks: ['lint:tests', 'karma:local']
            },
            flash: {
                files : [
                    'src/flash/com/longtailvideo/jwplayer/{,*/}*.as',
                    'src/flash/com/wowsa/{,*/}*.as'
                ],
                tasks: ['flash:debug', 'flash:debugLoader']
            }
        },

        connect: {
            options: {
                port: 3000,
                // change this to '0.0.0.0' to access the server from outside
                // change this to 'localhost' to restrict access to the server from outside
                hostname: 'localhost'
            },
            livereload: {
                options: {
                    open: true,
                    livereload: true,
                    base: [
                        '.'
                    ]
                }
            }
        },
        flash: {
            options: {
                flashVersion: '18.0',
                swfTarget: 29,
                targetCompilerOptions : [
                    '-define+=JWPLAYER::version,\'' + packageInfo.version + '\''
                ]
            },
            debug : {
                options : {
                    debug : true
                },
                files : {
                    'bin-debug/jwplayer.flash.swf' : 'src/flash/com/longtailvideo/jwplayer/player/Player.as'
                }
            },
            release : {
                files : {
                    'bin-release/jwplayer.flash.swf': 'src/flash/com/longtailvideo/jwplayer/player/Player.as'
                }
            },
            debugLoader : {
                files : {
                    'bin-debug/jwplayer.loader.swf' : 'src/flash/com/longtailvideo/jwplayer/FlashHealthCheck.as'
                }
            },
            releaseLoader : {
                files : {
                    'bin-release/jwplayer.loader.swf': 'src/flash/com/longtailvideo/jwplayer/FlashHealthCheck.as'
                }
            },
            library: {
                options: {
                    swc: true
                },
                files : {
                     'libs-external/jwplayer.flash.swc' : 'src/flash/com/longtailvideo/jwplayer/player/Player.as'
                }
            }
        },

        karma: {
            options: {
                configFile: './karma.conf.js',
                junitReporter: {
                    suite: '<%= grunt.task.current.target %>',
                    outputDir: 'reports/junit'
                },
                concurrency: 1
            },
            phantomjs: {
                browsers: ['PhantomJS']
            },
            chrome: {
                browsers: ['Chrome']
            },
            firefox: {
                browsers: ['Firefox']
            },
            safari: {
                browsers: ['Safari']
            },
            browserstack: {
                browsers: ['chrome', 'firefox', 'ie11_windows']
            },
            browserstack_chrome: {
                browsers: ['chrome']
            },
            browserstack_firefox: {
                browsers: ['firefox']
            },
            browserstack_edge: {
                browsers: ['edge']
            },
            browserstack_ie11: {
                browsers: ['ie11_windows']
            },
            browserstack_ie10: {
                browsers: ['ie10_windows']
            },
            browserstack_ie9: {
                browsers: ['ie9_windows']
            }
        },

        clean: {
            options: {
                force: true
            },
            dist: {
                src: [
                    'bin-debug/',
                    'bin-release/'
                ]
            }
        }
    });

    grunt.registerTask('webpack', 'Run webpack compiler', function() {
        const done = this.async();

        const targets = {};
        this.args.forEach(t => {
            targets[t] = true;
        });
        const configs = webpackConfigs(targets);

        // Store compiler for faster "watch" and "server" task running
        // this works as long as the watch task doesn't spawn a new process
        const id = this.args.join('_') || 'all';
        const compiler = webpackCompilers[id] || webpack(configs);
        webpackCompilers[id] = compiler;

        compiler.run(function(err, stats) {
            if (err) {
                throw err;
            }
            var jsonStats = stats.toJson();
            if (jsonStats.errors.length) {
                throw jsonStats.errors;
            }
            if (jsonStats.warnings.length) {
                console.warn(jsonStats.warnings);
            }
            done();
        });
    });

    grunt.registerTask('lint', 'ESLint JavaScript', function(target) {
        var command = 'npm run lint';
        if (target === 'test') {
            command = command + '-tests';
        }
        execSync(command, {
            cwd: '.',
            stdio: [0, 1, 2]
        });
    });

    grunt.registerTask('karma:local', 'karma:phantomjs');

    grunt.registerTask('karma:remote', [
        'karma:browserstack',
        'karma:browserstack_firefox',
        'karma:browserstack_ie11',
        'karma:browserstack_ie10',
        'karma:browserstack_ie9'
    ]);

    grunt.registerTask('test', [
        'karma'
    ]);

    grunt.registerTask('build-js', [
        'webpack',
        'lint:player',
        'stylelint',
        'less',
        'postcss'
    ]);

    grunt.registerTask('build-flash', [
        'flash:debug',
        'flash:release',
        'flash:debugLoader',
        'flash:releaseLoader'
    ]);

    grunt.registerTask('build', [
        'clean',
        'build-js',
        'build-flash',
        'karma:local'
    ]);

    grunt.registerTask('serve', [
        'connect:livereload',
        'watch'
    ]);

    grunt.registerTask('default', 'build');
};
