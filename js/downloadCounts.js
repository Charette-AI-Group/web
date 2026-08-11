/*!
 * Live download counts for the Charette AI Group app catalog.
 *
 * Two sources, one markup contract. Put either attribute on any element and
 * whatever the element already contains is the fallback shown when the
 * browser has no fetch() or the source cannot be reached.
 *
 * GitHub releases - for anything we publish as a downloadable file:
 *
 *   <span class="downloadCount"
 *         data-repo="Charette-AI-Group/cloakClip"
 *         data-assets="\.(exe|zip)$">&mdash;</span>
 *
 *   data-repo    owner/name of a public GitHub repository.
 *   data-assets  A regular expression matched against each release asset's
 *                file name; only matching assets are counted. Optional -
 *                every asset counts when it is left out.
 *
 * Obsidian community plugins - the number Obsidian itself publishes:
 *
 *   <span class="downloadCount"
 *         data-obsidian-plugin="html-font-toolbar">&mdash;</span>
 *
 *   data-obsidian-plugin  The plugin id, as it appears in its manifest and
 *                         in the community directory URL.
 *
 * Use the Obsidian source for plugins. GitHub only sees the few people who
 * download main.js by hand, so it badly under-reports a plugin installed
 * through the directory like nearly everyone does.
 *
 * No token is involved: both sources are public. Clone and view counts are
 * not, and can never be shown here - that would mean publishing a token in
 * a file anyone can read.
 */
(function () {
  'use strict';

  var GITHUB_API = 'https://api.github.com/repos/';
  var PAGE_SIZE = 100;
  var MAX_PAGES = 5;

  // Obsidian's own totals for every community plugin. Their site reads the
  // same numbers. It is a single ~2 MB file covering all 6000-odd plugins -
  // there is no per-plugin endpoint - so it is fetched once per page and the
  // one number we want is cached; the blob itself is never stored. If this
  // page ever gets real traffic again, the cheaper shape is a daily workflow
  // in the plugin's own repo writing its count to a small JSON, and pointing
  // OBSIDIAN_STATS at that instead. Nothing else here would change.
  var OBSIDIAN_STATS =
    'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugin-stats.json';

  // Anonymous api.github.com allows 60 requests an hour per visitor IP, so a
  // repeat visitor reads the cache instead of spending another request.
  var GITHUB_CACHE_MS = 6 * 60 * 60 * 1000;
  // Obsidian commits a fresh snapshot once a day, a little after 00:15 UTC.
  // Asking more often than that only re-reads the same numbers.
  var OBSIDIAN_CACHE_MS = 24 * 60 * 60 * 1000;

  function cacheGet(key, maxAge) {
    try {
      var raw = window.localStorage.getItem(key);
      if (!raw) {
        return null;
      }
      var entry = JSON.parse(raw);
      if (typeof entry.total !== 'number' || Date.now() - entry.time > maxAge) {
        return null;
      }
      return entry.total;
    } catch (error) {
      return null;
    }
  }

  function cacheSet(key, total) {
    try {
      window.localStorage.setItem(key, JSON.stringify({ total: total, time: Date.now() }));
    } catch (error) {
      // Private browsing or a full store: the count still works, just uncached.
    }
  }

  function countAssets(releases, pattern) {
    var total = 0;
    releases.forEach(function (release) {
      (release.assets || []).forEach(function (asset) {
        if (!pattern || pattern.test(asset.name)) {
          total += asset.download_count || 0;
        }
      });
    });
    return total;
  }

  function fetchPage(repo, page) {
    var url = GITHUB_API + repo + '/releases?per_page=' + PAGE_SIZE + '&page=' + page;
    return fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('GitHub returned ' + response.status);
        }
        return response.json();
      });
  }

  function githubTotal(repo, pattern) {
    var total = 0;

    function readPage(page) {
      return fetchPage(repo, page).then(function (releases) {
        total += countAssets(releases, pattern);
        if (releases.length === PAGE_SIZE && page < MAX_PAGES) {
          return readPage(page + 1);
        }
        return total;
      });
    }

    return readPage(1);
  }

  // Shared by every plugin on the page, so the big file is fetched at most once.
  var obsidianStats = null;

  function obsidianTotal(plugin) {
    if (!obsidianStats) {
      obsidianStats = fetch(OBSIDIAN_STATS).then(function (response) {
        if (!response.ok) {
          throw new Error('Obsidian returned ' + response.status);
        }
        return response.json();
      });
    }
    return obsidianStats.then(function (stats) {
      var entry = stats[plugin];
      if (!entry || typeof entry.downloads !== 'number') {
        throw new Error('No Obsidian stats for ' + plugin);
      }
      return entry.downloads;
    });
  }

  function show(element, total) {
    element.textContent = total.toLocaleString();
    element.removeAttribute('title');
  }

  function fail(element, source, error) {
    element.textContent = '—';
    element.title = 'Download count unavailable right now.';
    if (window.console) {
      window.console.warn('downloadCounts: ' + source, error);
    }
  }

  function plan(element) {
    var plugin = element.getAttribute('data-obsidian-plugin');
    if (plugin) {
      return {
        source: 'obsidian:' + plugin,
        key: 'obsidianDownloads:' + plugin,
        maxAge: OBSIDIAN_CACHE_MS,
        load: function () {
          return obsidianTotal(plugin);
        }
      };
    }

    var repo = element.getAttribute('data-repo');
    if (repo) {
      var assets = element.getAttribute('data-assets');
      var pattern = assets ? new RegExp(assets) : null;
      return {
        source: 'github:' + repo,
        key: 'downloadCount:' + repo + ':' + (assets || '*'),
        maxAge: GITHUB_CACHE_MS,
        load: function () {
          return githubTotal(repo, pattern);
        }
      };
    }

    return null;
  }

  function update(element) {
    var job = plan(element);
    if (!job) {
      return;
    }

    var cached = cacheGet(job.key, job.maxAge);
    if (cached !== null) {
      show(element, cached);
      return;
    }

    element.textContent = '…';
    job.load().then(function (total) {
      cacheSet(job.key, total);
      show(element, total);
    })['catch'](function (error) {
      fail(element, job.source, error);
    });
  }

  function start() {
    if (!window.fetch) {
      return; // Leaves each element's own fallback text in place.
    }
    var selector = '[data-repo], [data-obsidian-plugin]';
    Array.prototype.forEach.call(document.querySelectorAll(selector), update);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
