define(["vis/utils", "lib/d3", "builder/Input", "builder/ZoomContainer", "builder/Map", "builder/KeyManager", "builder/CobraModel"], function(utils, d3, Input, ZoomContainer, Map, KeyManager, CobraModel) {
    // NOTE
    // see this thread: https://groups.google.com/forum/#!topic/d3-js/Not1zyWJUlg
    // only necessary for selectAll()
    // .datum(function() {
    //     return this.parentNode.__data__;
    // })


    var Builder = utils.make_class();
    // instance methods
    Builder.prototype = { init: init };

    return Builder;

    // definitions
    function init(options) {
	// set defaults
	var o = utils.set_options(options, {
	    margins: {top: 10, right: 10, bottom: 10, left: 20},
	    selection: d3.select("body").append("div"),
	    selection_is_svg: false,
	    fillScreen: false,
	    update_hook: false,
	    map_path: null,
	    map_data: null,
	    cobra_model_path: null,
	    cobra_model: null,
	    css_path: null,
	    css: null,
	    flux_path: null,
	    flux: null,
	    flux2_path: null,
	    flux2: null,
	    node_data: null,
	    node_data_path: null,
	    node_data_style: 'ColorSize',
	    node_data_range: [0, 100],
	    show_beziers: false,
	    debug: false,
	    starting_reaction: 'GLCtex',
	    reaction_arrow_displacement: 35 });

	if (o.selection_is_svg) {
	    console.error("Builder does not support placement within svg elements");
	    return null;
	}

	var files_to_load = [{ file: o.map_path, value: o.map_data, callback: set_map_data },
			     { file: o.cobra_model_path, value: o.cobra_model, callback: set_cobra_model },
			     { file: o.css_path, value: o.css, callback: set_css },
			     { file: o.flux_path, value: o.flux,
			       callback: function(e, f) { set_flux(e, f, 0); } },
			     { file: o.flux2_path, value: o.flux2,
			       callback: function(e, f) { set_flux(e, f, 1); } },
			     { file: o.node_data_path, value: o.node_data, callback: set_node_data } ];
	utils.load_files(files_to_load, setup);
	return {};

	// Definitions

	// ---------------------------------------------------------------------
	// Setup

	function set_map_data(error, map_data) {
	    if (error) console.warn(error);
	    o.map_data = map_data;
	};
	function set_cobra_model(error, cobra_model) {
	    if (error) console.warn(error);
	    o.cobra_model = cobra_model;
	}
	function set_css(error, css) {
	    if (error) console.warn(error);
	    o.css = css;
	};
	function set_flux(error, flux, index) {
	    if (error) console.warn(error);
	    if (index==0) o.flux = flux;
	    else if (index==1) o.flux2 = flux;
	};
	function set_node_data(error, data) {
	    if (error) console.warn(error);
	    o.node_data = data;
	};
	function setup() {
	    /** Load the svg container and draw a loaded map if provided.
	     
	     */

	    // Begin with some definitions
	    var default_reaction_color = '#505050',
		metabolite_click_enabled = true,
		shift_key_on = false;

	    // Check the cobra model
	    var cobra_model = null;
	    if (o.cobra_model) {
		// TODO better checks
		cobra_model = CobraModel(o.cobra_model.reactions, o.cobra_model.cofactors);
	    }

	    // set up the svg
	    var out = utils.setup_svg(o.selection, o.selection_is_svg,
				      o.margins, o.fill_screen),
		svg = out.svg,
		height = out.height,
		width = out.width;

	    // set up the defs
	    var defs = utils.setup_defs(svg, o.css);

	    // set up the reaction input with complete.ly
	    var reaction_input = Input(o.selection);

	    // se up the zoom container
	    var zoom_callback = function() {
		if (reaction_input.is_visible) {
		    reaction_input.place_at_selected(this.map.scale.x, scale.y, 
						     this.window_scale, this.window_translate, 
						     width, height);
		}
	    };
	    var zoom_container = new ZoomContainer(svg, width, height, [0.05, 15], zoom_callback),
		zoomed_sel = zoom_container.zoomed_sel;

	    var max_w = width, max_h = height, scale, map;
	    if (o.map_data) {
		// import map
		map = Map.from_data(o.map_data, zoomed_sel, reaction_input, defs, zoom_container,
				    height, width, o.flux, o.node_data, cobra_model);
		zoom_container.reset_zoom();
	    } else {
		// new map
		map = new Map(zoomed_sel, reaction_input, defs, zoom_container,
			      height, width, o.flux, o.node_data, cobra_model);
	    }

	    var extent = {"x": o.width, "y": o.height},
		mouse_node = zoomed_sel.append('rect')
		    .attr('id', 'mouse-node')
		    .attr("width", extent.x)
		    .attr("height", extent.y)
	    // .attr("transform",
	    // 	  "translate("+(-extent.x/2)+","+(-extent.y/2)+")")
		    .attr("style", "stroke:black;fill:none;")
		    .attr('pointer-events', 'all');

	    zoomed_sel.append('g')
		.attr('id', 'brush-container');

	    // make key manager
	    var keys = get_keys();
	    var key_manager = new KeyManager(keys);
	    // set up menu and status bars
	    var menu = setup_menu(o.selection, map, key_manager, keys),
		status = setup_status(o.selection);

	    // setup selection box
	    if (!o.map_data) {
		// Draw default reaction if no map is provided
		var start_coords = {'x': o.width*5, 'y': o.height*5};
		map.new_reaction_from_scratch(o.starting_reaction, start_coords);
		zoom_container.zoom_extent(200);
	    } else {
		map.draw_everything();
		map.zoom_extent(200);
	    }

	    // turn off loading message
	    d3.select('#loading').style("display", "none");

	    // definitions
	    function setup_menu(selection, zoom_container, key_manager, keys) {
		var sel = selection.append("div").attr("id", "menu");
		new_button(sel, keys.hide_show_input.fn, "New reaction (/)");
		new_button(sel, keys.save.fn, "Save (^s)");
		new_button(sel, cmd_save_svg, "Export SVG (^Shift s)");
		key_manager.load_input_click_fn = new_input(sel, load_map_for_file, "Load (^o)");
		key_manager.load_flux_input_click_fn = new_input(sel, load_flux_for_file,
								 "Load flux (^f)");
		new_input(sel, load_node_data_for_file, "Load node data");
		if (o.show_beziers)
		    new_button(sel, cmd_hide_beziers, "Hide control points (b)", 'bezier-button');
		else
		    new_button(sel, cmd_show_beziers, "Show control points (b)", 'bezier-button');
		if (zoom_container.zoom_enabled())
		    new_button(sel, cmd_zoom_off, "Enable select (v)", 'zoom-button');
		else
		    new_button(sel, cmd_zoom_on, "Enable pan+zoom (z)", 'zoom-button');
		
		new_button(sel, cmd_rotate_selected_nodes, "Rotate (r)");
		new_button(sel, cmd_delete_selected_nodes, "Delete (del)");
		new_button(sel, cmd_zoom_extent, "Zoom extent (^0)");
		new_button(sel, cmd_make_selected_node_primary, "Make primary metabolite (p)");
		new_button(sel, cmd_cycle_primary_node, "Cycle primary metabolite (c)");
		new_button(sel, cmd_direction_arrow_left, "<");
		new_button(sel, cmd_direction_arrow_up, "^");
		new_button(sel, cmd_direction_arrow_down, "v");
		new_button(sel, cmd_direction_arrow_right, ">");
		new_button(sel, cmd_undo, "Undo (^z)");
		new_button(sel, cmd_redo, "Redo (^Shift z)");
		return sel;

		// definitions
		function load_map_for_file(error, map_data) {
		    if (error) console.warn(error);
		    out = import_and_load_map(map_data);
		    var map = out.map;
		    map.reset();
		    map.draw_everything();
		}
		function load_flux_for_file(error, data) {
		    set_flux(error, data, 0);
		    map.apply_flux_to_map();
		    map.draw_everything();
		}
		function load_node_data_for_file(error, data) {
		    set_node_data(error, data);
		    map.apply_node_data_to_map();
		    map.draw_everything();
		}
		function new_button(s, fn, name, id) {
		    var b = s.append("button").attr("class", "command-button")
			    .text(name).on("click", fn);
		    if (id !== undefined) b.attr('id', id);
		    return b;
		}
		function new_input(s, fn, name) {
		    /* 
		     * Returns a function that can be called to programmatically
		     * load files.
		     */
		    var input = s.append("input").attr("class", "command-button")
			    .attr("type", "file")
			    .style("display", "none")
			    .on("change", function() { utils.load_json(this.files[0], fn); });
		    new_button(sel, function(e) {
			input.node().click();
		    }, name);
		    return function() { input.node().click(); };
		}
	    }
	    function setup_status(selection) {
		return selection.append("div").attr("id", "status");
	    }
	}
	function get_keys() {
	    return  {
                hide_show_input: { key: 191, // forward slash '/'
				       fn: cmd_hide_show_input },
                save: { key: 83, modifiers: { control: true }, // ctrl-s
			    fn: cmd_save },
                // save_cmd: { key: 83, modifiers: { command: true }, // command-s
		// 		       fn: cmd_save },
                save_svg: { key: 83, modifiers: { control: true, shift: true }, // ctrl-Shift-s
				fn: cmd_save_svg },
                load: { key: 79, modifiers: { control: true }, // ctrl-o
			    fn: cmd_load },
		load_flux: { key: 70, modifiers: { control: true }, // ctrl-f
				 fn: cmd_load_flux },
		toggle_beziers: { key: 66,
				      fn: cmd_toggle_beziers,
				      ignore_with_input: true  }, // b
		pan_and_zoom: { key: 90, // z 
				    fn: cmd_zoom_on,
				    ignore_with_input: true },
		brush: { key: 86, // v
			     fn: cmd_zoom_off,
			     ignore_with_input: true },
		rotate: { key: 82, // r
			      fn: cmd_rotate_selected_nodes,
			      ignore_with_input: true },
		delete: { key: 8, // del
			      fn: cmd_delete_selected_nodes,
			      ignore_with_input: true },
		extent: { key: 48, modifiers: { control: true }, // ctrl-0
			      fn: map.zoom_extent },
		make_primary: { key: 80, // p
				    fn: cmd_make_selected_node_primary,
				    ignore_with_input: true },
		cycle_primary: { key: 67, // c
				     fn: cmd_cycle_primary_node,
				     ignore_with_input: true },
		direction_arrow_right: { key: 39, // right
					 fn: cmd_direction_arrow_right,
					 ignore_with_input: true },
		direction_arrow_down: { key: 40, // down
					fn: cmd_direction_arrow_down,
					ignore_with_input: true },
		direction_arrow_left: { key: 37, // left
					fn: cmd_direction_arrow_left,
					ignore_with_input: true },
		direction_arrow_up: { key: 38, // up
				      fn: cmd_direction_arrow_up,
				      ignore_with_input: true },
		undo: { key: 90, modifiers: { control: true },
			    fn: cmd_undo },
		redo: { key: 90, modifiers: { control: true, shift: true },
			    fn: cmd_redo }
	    };
	}
    };
});
