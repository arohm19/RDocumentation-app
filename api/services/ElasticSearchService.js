// SearchService.js - in api/services
var _ = require('lodash');
module.exports = {

  DAILY: 86400,

  queries: {
    aggregations: {
      download_per_package : {
        "terms" : { "field" : "package", "size" : 10000 }, //calculate percentile over all packages
        "aggs" : {
            "download_count" : { "value_count" : { "field" : "package" } }
        }
      },
      download_percentiles: {
        "percentiles_bucket": {
            "buckets_path": "download_per_package>download_count",
            "percents": _.range(1.00001, 100, 1).concat([99.5, 99.9, 99.99])

        }
      },
      "last_month_per_day": {
          "date_histogram" : {
              "field" : "datetime",
              "interval" : "day"
          }
      }
    },
    filters: {
      lastMonthStats: {
        "bool": {
          "filter": [
            {
                "term": { "_type": "stats" }
            },
            {
              "range": {
                  "datetime":  {
                      "gte" : "now-1M/d",
                      "lt" :  "now/d"
                  }
              }
            }
          ]
        }
      },
      lastMonthDownloads: {
        "size":"10000",
        "fields":["datetime","ip_id","package"],
        "sort":[ {"ip_id":{"order":"asc","ignore_unmapped" : true}},
                    {"datetime":{"order":"asc","ignore_unmapped" : true}}],
        "query":{
            "bool": {
                  "filter": [
                    {
                        "term": { "_type": "stats" }
                    },
                    {
                      "range": {
                          "datetime":  {
                              "gte" : "now-1w/d",
                              "lt" :  "now/d"
                          }
                      }
                    }
                  ]
                  }
              }

      }
    }
  },
      
  lastMonthPercentiles: function() {
    var body = {
      "query": ElasticSearchService.queries.filters.lastMonthStats,
      "size": 0, // do not retrieve data, we are only interested in aggregation data
      "aggs" : _.pick(ElasticSearchService.queries.aggregations, ['download_per_package', 'download_percentiles'])
    };

    return es.search({
      index: 'stats',
      requestCache: true, //cache the result
      body: body
    }).then(function(response) {
      return response.aggregations.download_percentiles.values;
    });

  },

  lastMonthDownloadCount: function() {
    var body = {
      "query": ElasticSearchService.queries.filters.lastMonthStats,
      "size": 0, // do not retrieve data, we are only interested in aggregation data
      "aggs" : {
        download_per_package: ElasticSearchService.queries.aggregations.download_per_package
      }
    };

    return es.search({
      index: 'stats',
      requestCache: true, //cache the result
      body: body
    }).then(function(response) {
      return response.aggregations.download_per_package.buckets;
    });

  },

  lastMonthPerDay: function(packageName) {
    var lastMonthPackageFilter =  _.cloneDeep(ElasticSearchService.queries.filters.lastMonthStats);
    lastMonthPackageFilter.bool.filter.push({ "term": { "package": packageName } });
    var body = {
      "query": lastMonthPackageFilter,
      "size": 0, // do not retrieve data, we are only interested in aggregation data
      "aggs" : {
        last_month_per_day: ElasticSearchService.queries.aggregations.last_month_per_day
      }
    };

    return es.search({
      index: 'stats',
      requestCache: true, //cache the result,
      body: body
    }).then(function(response) {
      return response.aggregations.last_month_per_day.buckets;
    });
  },

  cachedLastMonthPercentiles: function(res) {
    return RedisService.getJSONFromCache('percentiles', res, RedisService.DAILY, function() {
      return ElasticSearchService.lastMonthPercentiles();
    });
  },

  lastMonthDownloadsBulk:function(){
      console.log("here");
      hits = [];
       var body = ElasticSearchService.queries.filters.lastMonthDownloads;
       console.log(body);
      return es.search({
      scroll:'1m',
      index: 'stats',
      body: body,
      },function processAndGetMore(error,response){
        CronService.processDownloads(response,{},{},10000);
        });
  },
  scrollLastMonthDownloadsBulk:function(response,directDownloads,indirectDownloads,total){
    if (50000 > total) {
        // now we can call scroll over and over
        es.scroll({
          scrollId: response._scroll_id,
          scroll: '30s'
        }, function processScroll(error,response){
          CronService.processDownloads(response,directDownloads,indirectDownloads,total+10000);
        });
      } else {
        console.log("all hits: "+hits.length);
        console.log("directDownloads:"+directDownloads);
        console.log("indirectDownloads:" + indirectDownloads);
        CronService.writeSplittedDownloadCounts(directDownloads,indirectDownloads);
      }
  } 
};
