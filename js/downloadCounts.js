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

  // A plugin's count comes from its own repo, where a daily workflow copies the
  // figure out of Obsidian's published statistics into stats/downloads.json.
  // A few hundred bytes here instead of the 2 MB below.
  var PLUGIN_STATS = 'https://raw.githubusercontent.com/{repo}/main/stats/downloads.json';

  // The same numbers at source, used when a plugin's own record is missing or
  // unreadable - e.g. its workflow has not run yet. One ~2 MB file covering all
  // 6000-odd community plugins, with no per-plugin endpoint, so it is fetched
  // once per page and only the number we want is kept; the blob is never
  // stored. Obsidian rewrites it daily just after 00:15 UTC, and it trails
  // their internal counter by a day or two. Their directory page is fresher
  // but unusable: it rounds above a thousand ("1k"), and it served a frozen
  // value for weeks when we read it directly.
  var OBSIDIAN_STATS =
    'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugin-stats.json';

  // Long enough to spare anonymous api.github.com, which allows 60 requests an
  // hour per visitor IP, and to avoid re-pulling Obsidian's 2 MB file on every
  // visit - but short enough that a number updated today shows up today.
  var CACHE_MS = 6 * 60 * 60 * 1000;

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

  function pluginRepoTotal(repo) {
    return fetch(PLUGIN_STATS.replace('{repo}', repo)).then(function (response) {
      if (!response.ok) {
        throw new Error(repo + ' stats returned ' + response.status);
      }
      return response.json();
    }).then(function (stats) {
      if (typeof stats.downloads !== 'number') {
        throw new Error(repo + ' stats has no downloads number');
      }
      return stats.downloads;
    });
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
      var statsRepo = element.getAttribute('data-stats-repo');
      return {
        source: 'obsidian:' + plugin,
        key: 'obsidianDownloads:' + plugin,
        load: function () {
          if (!statsRepo) {
            return obsidianTotal(plugin);
          }
          return pluginRepoTotal(statsRepo)['catch'](function (error) {
            // Same numbers either way - this only covers a repo whose record
            // is missing, at the cost of the 2 MB file. Better than a dash.
            if (window.console) {
              window.console.warn('downloadCounts: falling back to Obsidian stats for ' + plugin, error);
            }
            return obsidianTotal(plugin);
          });
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

    var cached = cacheGet(job.key, CACHE_MS);
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
