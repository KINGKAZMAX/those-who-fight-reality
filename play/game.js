(function () {

    if (document.getElementById('flf-config')) {
        var flf_config = document.getElementById('flf-config').innerHTML;
        flf_config = JSON.parse(flf_config);
        requirejs.config({
            baseUrl: flf_config.root || '',
            urlArgs: 'ui=20261018-public-brand-1',
            paths: { game: '../play' },
            config: {}
        });
    }

    requirejs([
        'core/support', 'LF/loader!' + flf_config.package, 'LF/manager',
        'LF/util', './buildinfo.js', 'core/css!LF/application.css', 'game/urban-ui', 'game/reality-art',
        'game/reality-skills', 'game/reality-skills-ui', 'game/native-animation'
    ], function (Fsupport, package, Manager, util, buildinfo, css, attachUrbanUI, prepareRealityArt, Skills, attachSkillsUI, NativeAnimation) {

        if (typeof (console) === 'undefined') {
            console = {};
            console.log = console.error = console.info = console.debug = console.warn = console.trace = console.dir = console.dirxml = console.group = console.groupEnd = console.time = console.timeEnd = console.assert = console.profile = function () { };
        }

        console.log(util.div('projectFmessage').innerHTML);

        if (flf_config.package.indexOf('http') === 0) {
            package.path = flf_config.package;
            package.location = flf_config.package;
        } else {
            package.path = util.normalize_path(flf_config.package);
            package.location = util.normalize_path(flf_config.root + flf_config.package);
        }

        util.div('window_caption_title').innerHTML = buildinfo.version;

        // This local bundle includes the assets; skip obsolete remote mirrors.
        package.resourcemap = { condition: 'location contain http at 0', resource: {} };

        var loading = document.getElementById('reality-loading');
        prepareRealityArt(package, { nativeAnimation: true }).then(NativeAnimation.prepare).then(function () {
            new Manager(package, buildinfo, function (readyManager) {
                var api = attachUrbanUI(readyManager, package);
                api.skills = Skills.attach(api, package);
                api.skillsUI = attachSkillsUI(api, package, api.skills);
                api.animation = package.reality.animation;
                if (loading) loading.remove();
            });
        }).catch(function (error) {
            console.error(error);
            if (loading) {
                loading.querySelector('strong').textContent = '校園資源暫時沒有準備好';
                loading.querySelector('p').textContent = error.message + '。請重新整理頁面再試。';
                loading.querySelector('button').hidden = false;
            }
        });

    });

}());
