/*
    Taffy2JIT

    A standalone adapter between TaffyDB (client side database) and the Javascript
    InvoVis Toolkit (graphing and charting utility). This utility handles the
    generation of data to be used by JIT.

    Licence: Some words like GPL or MIT go here
*/

// TODO: Something with filter on string isnt working right


var $T2J = (function($T2J, $, undefined) {

/*
    +--------------------------------------------------------------------------+
	| Section: Constructor functions										   |
    |																		   |
	|	Functions used to create and update a T2J object					   |
	|																		   |
	+--------------------------------------------------------------------------+
*/

    function init(Args) {
        this.DB = Args.DB || null;
        this.Filter = Args.Filter || [];
        this.Format = Args.Format || {};

        this.json = {};
        this.rawJSON = [];
    }

    init.prototype.updateJSON = function() {
        var fnObj = buildRecursiveFilter(this.Filter);

        this.rawJSON = fnObj.fn.call(this.DB(), fnObj.fnArgs);

        this.json = this.Format.fn.call(this.rawJSON, this.Format.fnArgs);
    };


    $T2J = init;

/*
	+--------------------------------------------------------------------------+
	| Section: Utility Functions									           |
    |																		   |
	|	Contains functions that will only be used by other functions within    |
	|	this object, as well as several public utility functions.			   |
	+--------------------------------------------------------------------------+
*/
    $T2J.Utility = {};

/*
        Function: Utility.wrapString

			creates an array of string comparison objects from an array of strings

		Parameters:

			type - Type of match (Taffy comparison object: is, like, regex, etc.)
			values - The string array
			label - Boolean. Whether to add a parameter called 'label' for each value
				in the array. Can make creating label functions easier by always providing
				a consistent parameter.

		Returns:
			An array of string comparison objects.
	*/
	$T2J.Utility.wrapString = function(type, values, label) {
		var returnObj = [];
	
		for(var index in values) {
			var strObj = {};
			strObj[type] = values[index];
			strObj.label = label ? values[index] : '';
			returnObj.push(strObj);
		}
		
		return returnObj;
	};

/*
        Function: Utility.sanitizeStringObject

            Removes all non-comparison-operator parameters from a string comparison
            object to be sent to TAFFY in the format {'column':{'operator':string}}

		Parameters:

			stringObj - the {'operator':strings} object to clean

		Returns:
			A clean string comparison object
	*/
       
	$T2J.Utility.sanitizeStringObject = function(stringObj) {
		// acceptable operators to use on a string (per TAFFY returnFilter function)
        var whitelist = ['regex','left','leftnocase','right','rightnocase','like',
                            'is','isnocase','has','hasall','lt','gt','lte','gte'];
        
        // if a given property is not present in the whitelist, delete it
        for( var key in stringObj ) {
            if( $.inArray(key,whitelist) < 0 ) {
                delete stringObj[key];
            }
        }
        
        return stringObj;
	};

/*
        Function: Utility.dateInterval

			Builds an array of date comparison objects

		Parameters:

			timeInterval - An OLN object containing the following parameters:
                - type - The type of interval to create. Possible values are:
                    'year', 'qtr', 'month', 'week', and 'day'.
                - length - The length of each interval.
                - qty - The number of intervals to return
                - baseDate - The date to start from
                - direction - The direction to head from baseDate. A value of 1 
                    procedes forward from baseDate, -1 backward. NOTE: results 
                    are always returned in chronological order.

		Returns:
			An array of date comparison objects, each containing a 'gte' and 'lt'
            parameter.
	*/
    
    $T2J.Utility.dateInterval = function(timeInterval) {
        
        timeInterval.type = timeInterval.type || 'day';
        timeInterval.length = timeInterval.length || 1;
        timeInterval.qty = timeInterval.qty || 1;
        timeInterval.baseDate = timeInterval.baseDate || new Date();
        timeInterval.direction = (typeof timeInterval.direction === 'number') ? timeInterval.direction || 1 : 1;
        timeInterval.direction /= Math.abs(timeInterval.direction); // normalize. DivBy0 alredy protected against in above statement
            
        var values = [];
        
        switch (timeInterval.type) {
        case 'year':
            // start jan 1, end dec 31
            timeInterval.normalize = function(date) {
                date = new Date(date);
                return new Date(date.getFullYear(), 0, 1);
            };
            timeInterval.increment = function(date) {
                date = new Date(date);
                return new Date(date.getFullYear() + timeInterval.length * timeInterval.direction, date.getMonth(), date.getDate());
            };
            break;
        case 'qtr':
            // start 1st day of qtr, end last day of qtr
            timeInterval.normalize = function(date) {
                date = new Date(date);
                return new Date(date.getFullYear(), date.getMonth() - (date.getMonth() % 3), 1);
            };
            timeInterval.increment = function(date) {
                date = new Date(date);
                return new Date(date.getFullYear(), date.getMonth() + timeInterval.direction * timeInterval.length * 3, date.getDate());
            };
            break;
        case 'month':
            timeInterval.normalize = function(date) {
                date = new Date(date);
                return new Date(date.getFullYear(), date.getMonth(), 1);
            };
            timeInterval.increment = function(date) {
                date = new Date(date);
                return new Date(date.getFullYear(), date.getMonth() + timeInterval.direction * timeInterval.length, date.getDate());
            };
            break;
        case 'week':
            timeInterval.normalize = function(date) {
                date = new Date(date);
                return new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
            };
            timeInterval.increment = function(date) {
                date = new Date(date);
                return new Date(date.getFullYear(), date.getMonth(), date.getDate() + timeInterval.direction * timeInterval.length * 7);
            };
            break;
        default:
            // day
            timeInterval.normalize = function() {}; // no need to normalize a date
            timeInterval.increment = function(date) {
                date = new Date(date);
                return new Date(date.getFullYear(), date.getMonth(), date.getDate() + timeInterval.direction * timeInterval.length);
            };
        }

        var sd = timeInterval.normalize(timeInterval.baseDate), ed;
        
        // always run the first increment forward. i.e, if we are calling 'week' and today is tuesday, we want to include this week
        var tempDir = timeInterval.direction;
        timeInterval.direction = 1;
        ed = timeInterval.increment(sd);
        timeInterval.direction = tempDir;
        
        // if we are going backward, we will have to swap start and end dates so the second interval is generated properly
        if(timeInterval.direction < 0) {
            var tempDate = sd;
            sd = ed;
            ed = tempDate;
        }

        // build dates array if it doesn't exist
        // always travel in chronological order,
        if (values.length === 0) {
            for (var i = timeInterval.direction < 0 ? timeInterval.qty - 1  : 0;
                         timeInterval.direction < 0 ? i >= 0                : i < timeInterval.qty;
                         timeInterval.direction < 0 ? i--                   : i++) {

                values.push({
                    gte: (timeInterval.direction > 0) ? sd : ed,
                    lt: (timeInterval.direction > 0) ? ed : sd
                });

                sd = ed;
                ed = timeInterval.increment(sd);
            }
        }
        
        return values;
    };
    

/*
		Function: buildRecursiveFilter

			Builds an recursive function object from an array of filter functions

		Parameters:

			fnList - An array of filter function objects. Each must accept a
				TaffyDB query object and a callback 'onComplete'

		Returns:
			A function object in the form { fn: _function_, fnArgs: _args,
			including onComplete_ }
	*/

    function buildRecursiveFilter(fnList) {
        var newFnList = {
            fn: null,
            fnArgs: {}
        };

        // build the recursive list in reverse order
        for (var i = fnList.length - 1; i >= 0; i--) {
            // add onComplete to this fnArgs list
            var onCompleteTemp = $.extend({}, newFnList);

            newFnList.fn = fnList[i].fn;
            newFnList.fnArgs = fnList[i].fnArgs;

            if (i != fnList.length - 1) {
                newFnList.fnArgs.onComplete = onCompleteTemp;
            }
        }

        return newFnList;
    }

/*
		Function: makeid

			Builds a string of random hexidecimal characters

		Parameters:

			length - the length of string to return

		Returns:

			A string of random hexidecimal character, length determined by
			parameter.
    */

    function makeid(length) {
        var text = "";
        var possible = "ABCDEF0123456789";

        for (var i = 0; i < length; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));
        return text;
    }

/*
        Function: compareDate

			Compares a date to a date comparison object

		Parameters:

			compOp - The date comparison object to use
            val - The value to test
            julian - Boolean. Whether or not val is a Julian date

		Returns:

			True if val matches compOp. False otherwise.
    */
    
    function compareDate(compOp,val, julian) {
        // convert strings that resolve to dates into dates
        compOp.lt = compOp.lt ? new Date(compOp.lt) : undefined;
        compOp.gt = compOp.gt ? new Date(compOp.gt) : undefined;
        compOp.lte = compOp.lte ? new Date(compOp.lte) : undefined;
        compOp.gte = compOp.gte ? new Date(compOp.gte) : undefined;
        compOp.eq = compOp.eq ? new Date(compOp.eq) : undefined;
        val = val ? new Date(val) : undefined;

        // match based on
        var ltval = (compOp.lt instanceof Date) ? ((julian ? val : val.toJulian()) < compOp.lt.toJulian()) : true;
        var gtval = (compOp.gt instanceof Date) ? ((julian ? val : val.toJulian()) > compOp.gt.toJulian()) : true;
        var lteval = (compOp.lte instanceof Date) ? ((julian ? val : val.toJulian()) <= compOp.lte.toJulian()) : true;
        var gteval = (compOp.gte instanceof Date) ? ((julian ? val : val.toJulian()) >= compOp.gte.toJulian()) : true;
        var eqval = (compOp.eq instanceof Date) ? ((julian ? val : val.toJulian()) === compOp.eq.toJulian()) : true;

        return ltval && gtval && lteval && gteval && eqval;
    }
 
 /*
        Function: compareNum

    		Compares a number to a number comparison object

		Parameters:

			compOp - The number comparison object to use
            val - The value to test

		Returns:

			True if val matches compOp. False otherwise.
    */      
    
    function compareNum(compOp,val) {
            var ltval = (typeof compOp.lt === 'number') ? val < compOp.lt : true;
            var gtval = (typeof compOp.gt === 'number') ? val > compOp.gt : true;
            var lteval = (typeof compOp.lte === 'number') ? val <= compOp.lte : true;
            var gteval = (typeof compOp.gte === 'number') ? val >= compOp.gte : true;
            var eqval = (typeof compOp.eq === 'number') ? val === compOp.eq : true;

            return ltval && gtval && lteval && gteval && eqval;
        }

/*
	+--------------------------------------------------------------------------+
	| Section: Format Functions												   |
    |																		   |
	|	Functions used to format raw JSON returned by filter and group		   |
	|	functions															   |
	|																		   |
	|	An object 'Format' groups these functions.							   |
	+--------------------------------------------------------------------------+
*/
    $T2J.Format = {};

/*
		Function: Format.tree

			Formats raw JSON data returned by db filter and group functions in a
			tree style format. This format can be used with JIT Visualization
			types like icicle, sunburst, treemap, hypertree, and RGraph.

			Should be called on the rawJSON object to be formatted.

		Parameters:

			Args - A OLN object that can accept any of the following:
				- rootLabel - The label to place on the root node (which will
					contain all other nodes). Defaults to 'root' if not provided
				- color - An array of strings containing hex colors in the format
					"#RRGGBB" to be applied to nodes based on depth

		Returns:

			Properly formatted JSON to be used by JIT
	*/
    $T2J.Format.tree = function(Args) {
        var that = this;

        // function parameters
        var rootLabel = Args.rootLabel || 'root';
        var rawJSON = {
            label: rootLabel,
            values: that || {}
        };
        var color = Args.color || ["#416D9C", "#70A35E", "#EBB056", "#C74243", "#83548B", "#909291", "#557EAA"];

        //Function: recurseChildren
        //A function local to the tree function responsible for building the
        //formatted JSON object
        var recurseChildren = function(Args) {
                //function parameters
                var target = Args.target || {};
                var color = Args.color || ["#416D9C", "#70A35E", "#EBB056", "#C74243", "#83548B", "#909291", "#557EAA"];
                var depth = Args.depth || 0;

                var json = {};
                var sum = 0;

                json.id = 'node-' + depth + '-' + makeid(4);
                json.name = target.label;
                json.children = [];

                if (typeof target.values == 'number') {
                    sum = target.values;
                }
                else {
                    for (var index in target.values) {
                        json.children.push(recurseChildren({
                            'children': target.values[index],
                            'depth': depth + 1,
                            'color': color
                        }));
                    }
                    for (var index in json.children) {
                        sum += json.children[index].data.$area;
                    }
                }
                json.data = {
                    '$area': sum,
                    '$dim': sum,
                    '$color': color[depth]
                };
                return json;
            };

        return recurseChildren({
            'children': rawJSON,
            'color': color
        });
    };

/*
		Function: Format.chart

			Formats raw JSON data returned by db filter and group functions in a
			chart style format. This format can be used with JIT Visualization
			types like pie, bar, and area.

			Should be called on the rawJSON object to be formatted.

		Parameters:

			Args - A OLN object that can accept any of the following:
				- color - An array of strings containing hex colors in the format
					"#RRGGBB" to be applied to nodes based on depth

		Returns:

			Properly formatted JSON to be used by JIT
	*/

    $T2J.Format.chart = function(Args) {
        var that = this;

        // function parameters
        var rawJSON = that || {};
        var color = Args.color || ["#416D9C", "#70A35E", "#EBB056", "#C74243", "#83548B", "#909291", "#557EAA"];

        var returnJSON = {
            'color': color,
            'label': [],
            'values': []
        };

        // build the JSON object
        for (var i in rawJSON) {
            // add labels to the root (y Axis labels)
            if (i == 0) {
                for (var l in rawJSON[0].values) {
                    returnJSON.label.push(rawJSON[0].values[l].label);
                }
            }

            // start building the current record
            var tempValues = {
                label: rawJSON[i].label,
                values: []
            };
            // push values objects into current record (this ends up being the
            // point where the next nested function is called)
            for (var j in rawJSON[i].values) {
                tempValues.values.push(rawJSON[i].values[j].values);
            }
            returnJSON.values.push(tempValues);
        }
        return returnJSON;
    };

/*
		Function: Format.chartRelative

			Formats raw JSON data returned by db filter and group functions in a
			chart style format. This format can be used with JIT Visualization
			types like pie, bar, and area.

			This function normalizes each value based on the sum of its
			respective x Axis group (each value will be between 0 and 1)

			Should be called on the rawJSON object to be formatted.

		Parameters:

			Args - A OLN object that can accept any of the following:
				- color - An array of strings containing hex colors in the format
					"#RRGGBB" to be applied to nodes based on depth

		Returns:

			Properly formatted JSON to be used by JIT
	*/

    $T2J.Format.chartRelative = function(Args) {
        var that = this;

        // function parameters
        var rawJSON = that || {};
        var color = Args.color || ["#416D9C", "#70A35E", "#EBB056", "#C74243", "#83548B", "#909291", "#557EAA"];

        var returnJSON = {
            // TODO: make it so that the user can change colors
            'color': color,
            'label': [],
            'values': []
        };

        for (var i in rawJSON) {
            if (i == 0) {
                for (var l in rawJSON[0].values) {
                    returnJSON.label.push(rawJSON[0].values[l].label);
                }
            }
            var tempValues = {
                label: rawJSON[i].label,
                values: []
            };
            var sum = 0;
            // first, push the returned values, collect the sum
            for (var j in rawJSON[i].values) {
                sum += rawJSON[i].values[j].values;
                tempValues.values.push(rawJSON[i].values[j].values);
            }
            // then, replace the returned values with their respective percentage
            for (var k in tempValues.values) {
                tempValues.values[k] = (sum !== 0) ? tempValues.values[k] / sum : 0;
            }
            returnJSON.values.push(tempValues);
        }
        return returnJSON;
    };

/*
	+--------------------------------------------------------------------------+
	| Section: Filter Functions												   |
    |																		   |
	|	Functions used to filter a query object as part of a recursive		   |
	|	filter																   |
	|																		   |
	|	All filter functions must accept a query object and an optional		   |
	|	onComplete function, and return a query object or the results of the   |
	|	onComplete function.												   |
	+--------------------------------------------------------------------------+
*/

    $T2J.Filter = {};

/*
		Function: Filter.byString

			Filters a query object using a string or array of strings

		Parameters:

			Args - A OLN object that can accept any of the following:
				- field - The field within the database to search
				- values - A string comparison object. Contains a TAFFY comparison
                    operator and a string (or array of strings). For example:
                    {'like':'Ph'}, {'is':'Physical'}, or {'regex':'/^Ph/i'}
                - onComplete - a function to be called on the filtered object
                    before it is returned. Usually added by <buildRecursiveFilter>

	*/
    $T2J.Filter.byString = function(Args) {
        var that = this;

        // function arguements
        var field = Args.field || '';
        var values = Args.values || {};
        var onComplete = Args.onComplete || null;

        var filterArg = {};
        
        filterArg[field] = $T2J.Utility.sanitizeStringObject(values);

        var returnObj = that.filter(filterArg);

        if (onComplete !== null) {
            returnObj = onComplete.fn.call(returnObj, onComplete.fnArgs);
        }

        return returnObj;
    };

/*
		Function: Filter.byNumber

			Filters a query object using a string or array of strings

		Parameters:

			Args - A OLN object that can accept any of the following:
				- field - The field within the database to search
				- numbers - Array of number comparison objects containing any
					of the parameters lt, gt, lte, gte, or eq. Example:
					[{ gte: 8, lt:9 },{ lt: 0 }, { eq: 10 }] will return all
					records where "field" has a value greater-than or equal-to
					8 and less than 9, less than 0, or equal to 10
				- onComplete - a function to be called on the filtered object
					before it is returned. Usually added by <buildRecursiveFilter>
	*/

    $T2J.Filter.byNumber = function(Args) {
        var that = this;

        // function parameters
        var field = Args.field || '';
        var values = Args.values || [];
        var onComplete = Args.onComplete || null;

        // if numbers is a single value, convert it to an array
        values = !$.isArray(values) ? [values] : values;

        var returnObj = that.filter(function() {
            // return true if the record matches any of the number criteria
            for (var j in values) {
                if (compareNum(values[j],this[field])) {
                    return true;
                }
            }
            return false;
        });

        // if an onComplete action was defined, call it on the returnObj
        if (onComplete !== null) {
            returnObj = onComplete.fn.call(returnObj, onComplete.fnArgs);
        }

        return returnObj;
    };

/*
		Function: Filter.byDate

			Filters a query object using a string or array of strings

		Parameters:

			Args - A OLN object that can accept any of the following:
				- field - The field within the database to search
				- dates - Array of date comparison objects containing any
					of the parameters lt, gt, lte, gte, or eq. Accepts javascript
					Date objects
				- julian - A boolean value. True if dates stored in the db are
					in julian format. False if dates are stored as Date objects.
				- onComplete - a function to be called on the filtered object
					before it is returned. Usually added by <buildRecursiveFilter>
	*/

    $T2J.Filter.byDate = function(Args) {
        var that = this;

        // function arguements
        var field = Args.field || '';
        var julian = Args.julian || false;
        var values = Args.values || [];
        var onComplete = Args.onComplete || null;

        // if dates is a single value, convert it to an array
        values = !$.isArray(values) ? [values] : values;

        var returnObj = that.filter(function() {
            // return true if the record matches any of the number criteria
            for (var j in values) {
                if(compareDate(values[j],this[field],julian)) {
                    return true;
                }
            }
            return false; // return false if nothing matches
        });

        // if an onComplete action was defined, call it on the returnObj
        if (onComplete !== null) {
            returnObj = onComplete.fn.call(returnObj, onComplete.fnArgs);
        }

        return returnObj;
    };

/*
	+--------------------------------------------------------------------------+
	| Section: Group Functions												   |
    |																		   |
	|	Functions used to group a query object as part of a recursive		   |
	|	filter																   |
	|																		   |
	|	All group functions must accept a query object and an _required_	   |
	|	onComplete function and can accept an arbitrary number of other		   |
	|	parameters. Group functions should take the recieved query object and  |
	|	group its results by some criteria, producing a new query obect for	   |
	|	each group. As each new query object is created, a results object	   |
	|	should be added to an array that will be returned at the close of the  |
	|	function.															   |
	|																		   |
	|	The results objects comprising the array should each contain 'label'   |
	|	and 'values', where 'label' contains a string describing the group and |
	|	'values' contains the result of the onComplete function, which should  |
	|	be called on the new query object of each group.					   |
	|																		   |
	|	This recursive structure will create a tree of results. At the end of  |
	|	each group string, a function from $T2J.Value should be called to	   |
	|	return an actual result. An example of the output structure follows:   |
	|																		   |
	|	(start code)														   |
	|	[{																	   |
	|		label: "Breakfast",												   |
	|		values: [{														   |
	|			label: "Eggs",												   |
	|			values: [{													   |
	|				label: "calories",										   |
	|				values: [100]											   |
	|			}, {														   |
	|				label: "fat",											   |
	|				values: ['4g']											   |
	|			}]															   |
	|		}, {															   |
	|			label: "Toast",												   |
	|			values: [{													   |
	|				label: "calories",										   |
	|				values: [130]											   |
	|			}, {														   |
	|				label: "fat",											   |
	|				values: ['0g']											   |
	|			}]															   |
	|		}]																   |
	|	}, {																   |
	|																		   |
	|	...																	   |
	|																		   |
|	}]																		   |
	|	(end)																   |
	+--------------------------------------------------------------------------+
*/

    $T2J.Group = {};

/*
		Function: Group.byString

			Filters a query object using a string or array of strings

		Parameters:

			Args - A OLN object that can accept any of the following:
				- field - The field within the database to search
				- strings - Array of string comparison operators to group by. See
                    Filter.byString.
				- label - A function returning a string to apply to each group.
					The function will be passed an OLN object containing 'field'
					and 'string', where 'field' is the db field being searched
					and 'string' is the search string array of the current group
				- onComplete - The function call object defining the function
					to be called on the query object of each group. Usually
					added by <buildRecursiveFilter>.
	*/

    $T2J.Group.byString = function(Args) {
        var that = this;

        // function arguements
        var field = Args.field || '';
        var values = Args.values || [];
        var label = Args.label ||
        function() {
            return '';
        };
        var onComplete = Args.onComplete || {
            fn: function() {
                return "ERROR:NOVALUEFUNCTION";
            },
            fnArgs: {}
        };

        var returnObj = [];

        for (var index in values) {
            var queryObj = $T2J.Filter.byString.call(that, {
                'field': field,
                'values': values[index]
            });

            returnObj.push({
                'label': label(values[index]),
                'values': onComplete.fn.call(queryObj, onComplete.fnArgs)
            });
        }

        return returnObj;
    };

/*
		Function: Group.byNumber

			Filters a query object using a string or array of strings

		Parameters:

			Args - A OLN object that can accept any of the following:
				- field - The field within the database to search
				- numbers - Array of number comparison objects (or an array of
					arrays of numbers comparison objects) in the format defined
					in <Filter.byNumber>. Will group by "field" matching
					"numbers[i]"
				- label - A function returning a string to apply to each group.
					The function will be passed an OLN object containing the
					number comparison object used to search and may contain
					"lt", "gt", "lte", "gte", and/or "eq". Each of these may
					be either a number or undefined.
				- onComplete - The function call object defining the function
					to be called on the query object of each group. Usually
					added by <buildRecursiveFilter>.
	*/

    $T2J.Group.byNumber = function(Args) {
        var that = this;

        // function arguements
        var field = Args.field || '';
        var values = Args.values || [];
        var label = Args.label ||
        function() {
            return 'ERR:NOLBL-' + makeid(3);
        };
        var onComplete = Args.onComplete || {
            fn: function() {
                return "ERROR:NOVALUEFUNCTION";
            },
            fnArgs: {}
        };


        var returnObj = [];

        for (var i in values) {

            var filterArg = {
                'field': field
            };

            filterArg.values = {
                lt: (typeof values[i].lt === 'number') ? values[i].lt : undefined,
                gt: (typeof values[i].gt === 'number') ? values[i].gt : undefined,
                lte: (typeof values[i].lte === 'number') ? values[i].lte : undefined,
                gte: (typeof values[i].gte === 'number') ? values[i].gte : undefined,
                eq: (typeof values[i].eq === 'number') ? values[i].eq : undefined
            };

            var labelVal = label(filterArg);

            var queryObj = $T2J.Filter.byNumber.call(that, filterArg);

            returnObj.push({
                'label': labelVal,
                'values': onComplete.fn.call(queryObj, onComplete.fnArgs)
            });
        }

        return returnObj;
    };

/*
		Function: Group.byDate

			Filters a query object using a string or array of strings

		Parameters:

			Args - A OLN object that can accept any of the following:
				- field - The field within the database to search
				- values - Array of date comparison objects (or an array of
					arrays of date comparison objects) in the format defined
					in <Filter.Date>. It is not necessary to define 'dates' if
					'timeInterval' is passed. If both are passed, 'dates' will
					take precedence.
				- label - A function returning a string to apply to each group.
					The function will be passed an OLN object containing the
					date comparison object used to search and may contain
					"lt", "gt", "lte", "gte", and/or "eq". Each of thes may be
					a Date object or undefined.
				- onComplete - The function call object defining the function
					to be called on the query object of each group. Usually
					added by <buildRecursiveFilter>.
	*/

    $T2J.Group.byDate = function(Args) {
        var that = this;

        // function arguements
        var field = Args.field || '';
        var values = Args.values || [];
        var label = Args.label ||
        function() {
            return '';
        };
        var onComplete = Args.onComplete || {
            fn: function() {
                return "ERROR:NOVALUEFUNCTION";
            },
            fnArgs: {}
        };

        var returnObj = [];

        for (var index in values) {
            var queryObj = $T2J.Filter.byDate.call(that, {
                'field': field,
                'values': values[index]
            });

            returnObj.push({
                'label': label(values[index]),
                'values': onComplete.fn.call(queryObj, onComplete.fnArgs)
            });
        }

        return returnObj;
    };

/*
	+--------------------------------------------------------------------------+
	| Section: Value Functions												   |
    |																		   |
	|	Contains functions that evaluate a query object to a value.			   |
	|	this object															   |
	|																		   |
	|	All functions must accept a query object an return a value.			   |
	|																		   |
	+--------------------------------------------------------------------------+
*/

    $T2J.Value = {};

/*
		Function: Value.bySum

			Returns a sum based on a query object.

		Parameters:

			field - The field to sum

		Returns:
			A numeric sum.
	*/

    $T2J.Value.bySum = function(Args) {
        var field = Args.field || '';
        return this.sum(field);
    };

/*
		Function: Value.byCount

			Returns a count of records
	*/

    $T2J.Value.byCount = function() {
        return this.count();
    };

    return $T2J;

}(window.$T2J = window.$T2J || {}, jQuery));