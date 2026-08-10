/*!
 * Live release download counts for the Charette AI Group app catalog.
 *
 * Markup contract - put these attributes on any element:
 *
 *   <span class="downloadCount"
 *         data-repo="Charette-AI-Group/cloakClip"
 *         data-assets="\.(exe|zip)$">&mdash;</span>
 *
 *   data-repo    owner/name of a public GitHub repository. Required.
 *   data-assets  A regular expression matched against each release asset's
 *                file name; only matching assets are counted. Optional -
 *                every asset counts when it is left out.
 *
 * The number is summed over every release of the repository, so it is the
 * cumulative total since the first version rather than the latest one only.
 * Whatever the element already contains is the fallback shown when the
 * browser has no fetch() or GitHub cannot be reached.
 *
 * No token is involved: release download counts are public. Clone and view
 * counts are not, and can never be shown here - that would mean publishing a
 * token in a file anyone can read.
 */
(function () {
  'use strict';

  var API = 'https://api.github.com/repos/';
  var PAGE_SIZE = 100;
  var MAX_PAGES = 5;
  // Anonymous api.github.com allows 60 requests an hour per visitor IP, so a
  // repeat visitor reads the cache instead of spending another request.
  var CACHE_MS = 6 * 60 * 60 * 1000;

  function cacheKey(repo, assets) {
    return 'downloadCount:' + repo + ':' + (assets || '*');
  }

  function cacheGet(key) {
    try {
      var raw = window.localStorage.getItem(key);
      if (!raw) {
        return null;
      }
      var entry = JSON.parse(raw);
      if (typeof entry.total !== 'number' || Date.now() - entry.time > CACHE_MS) {
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
    var url = API + repo + '/releases?per_page=' + PAGE_SIZE + '&page=' + page;
    return fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('GitHub returned ' + response.status);
        }
        return response.json();
      });
  }

  function fetchTotal(repo, pattern) {
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

  function show(element, total) {
    element.textContent = total.toLocaleString();
    element.removeAttribute('title');
  }

  function fail(element, repo, error) {
    element.textContent = '—';
    element.title = 'Download count unavailable right now.';
    if (window.console) {
      window.console.warn('downloadCounts: ' + repo, error);
    }
  }

  function update(element) {
    var repo = element.getAttribute('data-repo');
    if (!repo) {
      return;
    }
    var assets = element.getAttribute('data-assets');
    var pattern = assets ? new RegExp(assets) : null;
    var key = cacheKey(repo, assets);

    var cached = cacheGet(key);
    if (cached !== null) {
      show(element, cached);
      return;
    }

    element.textContent = '…';
    fetchTotal(repo, pattern).then(function (total) {
      cacheSet(key, total);
      show(element, total);
    })['catch'](function (error) {
      fail(element, repo, error);
    });
  }

  function start() {
    if (!window.fetch) {
      return; // Leaves each element's own fallback text in place.
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-repo]'), update);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
