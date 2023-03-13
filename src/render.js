/*
 * Copyright © 2020. TIBCO Software Inc.
 * This file is subject to the license terms contained
 * in the license file that is distributed with this file.
 */


// @ts-ignore
import * as d3 from "d3";
import { MAX_UNSIGNED_VALUE } from "../node_modules/@xtuc/long/index.js";
import * as ModuleParseError from "../node_modules/webpack/lib/ModuleParseError.js";
import { addHandlersSelection } from "./ui-input.js";

//@ts-check

/**
 * @typedef {{
 *          colorIndex: number;
 *          markedColor: string;
 *          unmarkedColor: string;
 *          markedSegments: number[][]
 *          name: string;
 *          sum: number;
 *          }} RenderGroup;
 */

/**
 * Prepare some dom elements that will persist  throughout mod lifecycle
 */
const modContainer = d3.select("#mod-container");

/**
 * Main svg container
 */
const svg = modContainer.append("svg").attr("xmlns", "http://www.w3.org/2000/svg");

/**
 * Global variable
 */
var corners;

var prevExpressions;
var prevShowLabelsAxis;
var prevDataView; // For object reference consistency (resize or redraw)
var prevWindowSize; // For object reference consistency (resize or redraw)
var defs, rect;



/**
 * Renders the chart.
 * @param {Object} state
 * @param {Spotfire.Mod} mod
 * @param {Spotfire.DataView} dataView - dataView
 * @param {Spotfire.Size} windowSize - windowSize
 * @param {Spotfire.ModProperty<string>} showAxisLabels - showLabels
 */
export async function render(state, mod, dataView, windowSize, showAxisLabels) {
    if (state.preventRender) {
        // Early return if the state currently disallows rendering.
        return;
    }



    const onSelection = ({ dragSelectActive }) => {
        state.preventRender = dragSelectActive;
    };

    const styling = mod.getRenderContext().styling;
    const { tooltip, popout } = mod.controls;
    const { radioButton, checkbox } = popout.components;
    const { section } = popout;
    const isEditing = mod.getRenderContext().isEditing;

    let settingsIcon = document.querySelector(".settings");
    settingsIcon?.classList.toggle("hidden", !isEditing);

    
    
    /**
     * A helper function to compare a property against a certain value
     */
    const is = (property) => (value) => property.value() == value;


    /**
     * The DataView can contain errors which will cause rowCount method to throw.
     */
    let errors = await dataView.getErrors();
    if (errors.length > 0) {
        svg.selectAll("*").remove();
        mod.controls.errorOverlay.show(errors, "dataView");
        return;
    }

    mod.controls.errorOverlay.hide("dataView");

    const allRows = await dataView.allRows();
    if (allRows == null) {
        // Return and wait for next call to render when reading data was aborted.
        // Last rendered data view is still valid from a users perspective since
        // a document modification was made during a progress indication.
        return;
    }
    const colorHierarchy = await dataView.hierarchy("Color");

    const aAxisMeta = await mod.visualization.axis("Bottom");
    const bAxisMeta = await mod.visualization.axis("Left");
    const cAxisMeta = await mod.visualization.axis("Right");
    const colorAxisMeta = await mod.visualization.axis("Color");

    const margin = { top: 20, right: 40, bottom: 40, left: 80 };


    /**
     * Sets the viewBox to match windowSize
     */
    svg.attr("viewBox", [0, 0, windowSize.width, windowSize.height]);


    /**
     * Creates a clipping region that will be used to mask out everything outside of it.
     */
    if (!defs) {
        defs = svg
            .append("defs")
            .append("clipPath")
            .attr("id", "clipPath")
            .append("rect")
            .attr("x", margin.left)
            .attr("y", margin.top);
    }
    defs.attr("width", windowSize.width - margin.left - margin.right).attr(
        "height",
        windowSize.height - (margin.bottom + margin.top)
    );

    /**
     * Background rectangle - used to catch click events and clear marking.
     */
    if (!rect) {
        rect = svg
            .append("rect")
            .attr("fill", "#000")
            .attr("fill-opacity", 0)
            .attr("x", 0)
            .attr("y", 0)
            .on("click", () => prevDataView.clearMarking());
    }

    rect.attr("width", windowSize.width).attr("height", windowSize.height);

    /**
     * This will add rectangle selection elements to DOM.
     * The callback will check the selection bounding box against each point and mark those that intersect the box.
     */
    addHandlersSelection((result) => {
        onSelection(result);

        const { x, y, width, height, ctrlKey } = result;

        svg.selectAll("circle").each((d, i) => {
            const xPos = rowToCoords(d)[0];
            const yPos = rowToCoords(d)[1];
            if (xPos >= x && xPos <= x + width && yPos >= y && yPos <= y + height) {
                ctrlKey ? d.mark("ToggleOrAdd") : d.mark();
            }
        });
    });

    var w = Math.min(windowSize.width, windowSize.height) - margin.left - margin.right;
    var h = w * Math.abs(Math.cos(60)); //Equilateral triangle
    var m = margin.left;

    corners = [
        [m, h + m],
        [w + m, h + m],
        [w / 2 + m, m]
    ];

    //What changed?
    var showLabels = is(showAxisLabels)("yes");
    var showLabelsAxisChanged = prevShowLabelsAxis == null ||  (!is(prevShowLabelsAxis)(showAxisLabels.value()));
    var windowSizeChanged = prevWindowSize != windowSize;
    var dataViewChanged = prevDataView != dataView;

    prevShowLabelsAxis = showAxisLabels;
    prevWindowSize = windowSize;
    prevDataView = dataView;

    var axisClickSurfaceClassName = "axisClickSurface";

    var expressions = [aAxisMeta.parts[0].displayName, cAxisMeta.parts[0].displayName, bAxisMeta.parts[0].displayName];

    var expressionsChanged = prevExpressions != expressions;

    prevExpressions = expressions;



    
    var names = [aAxisMeta.name, cAxisMeta.name, bAxisMeta.name];
    var rotate = [0, 60, -60]

    var translate = [
        [w/2, styling.scales.font.fontSize * 3], 
        [-(w/4) + (styling.scales.font.fontSize * 3),-(w/2 + styling.scales.font.fontSize * 0.6)],
        [-(w/4 + (styling.scales.font.fontSize * 3)), (w/2 - styling.scales.font.fontSize * 0.6)]
    ];
    

    var points = [coord(100,0,0),coord(0,100,0),coord(0,0,100)]

    var textOffset = styling.scales.font.fontSize * 3;
    
    var polygonPoints = [
                            [
                                points[0],
                                [points[0][0] + w, points[0][1]], //x0 -> x0+w
                                [points[0][0] + w , points[0][1] + textOffset], // x0 +w  -> y +textOffset
                                [points[0][0], points[0][1] + textOffset]  // x0, -> x0, y+textOffset
                            ].join(" "),
                            [
                                points[1],
                                [points[1][0] - w/2, points[1][1] - h], //x0 -> x0+w
                                [points[1][0] - w/2 + textOffset , points[1][1] - h], // x0 +w  -> y +textOffset
                                [points[1][0] + textOffset, points[1][1]]  // x0, -> x0, y+textOffset
                            ].join(" "),
                            [
                                points[2],
                                [points[2][0] - w/2, points[2][1] +h], //x0 -> x0+w
                                [points[2][0] - w/2 - textOffset , points[2][1] + h], // x0 +w  -> y +textOffset
                                [points[2][0] - textOffset, points[2][1]]  // x0, -> x0, y+textOffset
                            ].join(" "),
                
                        ];

    

    console.log(polygonPoints);

    var axisClasses = ["axis axis-a", "axis axis-c", "axis axis-b"]
    var axisLabelClasses = ["label-a", "label-c", "label-b"]
    if (windowSizeChanged || showLabelsAxisChanged || expressionsChanged ) {


        
        svg.selectAll("line").remove();
        svg.selectAll("text").remove();
        svg.selectAll("."+ axisClickSurfaceClassName).remove();

        corners.forEach(function (corner, idx) {

            var c1 = idx,
                c2 = idx + 1;
            if (c2 >= corners.length) {
                c2 = 0;
            }

            

            var transformStatement = `translate(${points[idx][0]+ translate[idx][0]},${points[idx][1] + translate[idx][1]}) rotate(${rotate[idx]})`;

            if (showLabels)
            {
                svg.append("text")
                    .attr("x", 0)
                    .attr("y", 0)
                    .text(function (d) {return expressions[idx];})
                    .attr("font-size", styling.scales.font.fontSize)
                    .attr("font-family", styling.scales.font.fontFamily)
                    .attr("text-anchor", "middle")
                    .attr("transform", transformStatement)
                    .classed(axisLabelClasses[idx], true);

            }

            svg.append("polygon")
            .attr("points", polygonPoints[idx])
            .attr("fill", "#000")
            .attr("fill-opacity", 0.0)
            .attr("class", axisClickSurfaceClassName)
        
            svg.append("line")
                .attr("x1", corners[c1][0])
                .attr("y1", corners[c1][1])
                .attr("x2", corners[c2][0])
                .attr("y2", corners[c2][1])
                .attr("name", names[idx])
                .on("mouseover", function (d) {
                    tooltip.show(expressions[idx]);
                })
                .on("mouseout", function (d) {
                    tooltip.hide();
                })
                .classed(axisClasses[idx], true)
                .classed("axis", true);

        });

        var ticks = [0, 20, 40, 60, 80, 100],
            n = ticks.length;

        if (w < 200 )
        {
            ticks = [0, 25, 50, 75, 100];
            n = ticks.length;
        }

        ticks.forEach(function (v) {
            var coord1 = coord(v, 0, 100 - v);
            var coord2 = coord(v, 100 - v, 0);
            var coord3 = coord(0, 100 - v, v);
            var coord4 = coord(100 - v, 0, v);

            if (v !== 0 && v !== 100) {
                svg.append("line")
                    .attr("x1", coord1[0])
                    .attr("y1", coord1[1])
                    .attr("x2", coord2[0])
                    .attr("y2", coord2[1])
                    .classed("tick tick-b", true);

                svg.append("line")
                    .attr("x1", coord2[0])
                    .attr("y1", coord2[1])
                    .attr("x2", coord3[0])
                    .attr("y2", coord3[1])
                    .classed("tick tick-a", true);

                svg.append("line")
                    .attr("x1", coord3[0])
                    .attr("y1", coord3[1])
                    .attr("x2", coord4[0])
                    .attr("y2", coord4[1])
                    .classed("tick tick-c", true);
            }

            svg.append("text")
                .attr("x", coord1[0] - styling.scales.font.fontSize * Math.floor(Math.log10(v + 1) + 1) * 0.7)
                .attr("y", coord1[1])
                .attr("font-size", styling.scales.font.fontSize)
                .attr("font-family", styling.scales.font.fontFamily)
                .text(function (d) {
                    return v;
                })
                .classed("tick-text tick-b", true);

            svg.append("text")
                .attr("x", coord2[0] - 6)
                .attr("y", coord2[1] + styling.scales.font.fontSize * 1.3)
                .attr("font-size", styling.scales.font.fontSize)
                .attr("font-family", styling.scales.font.fontFamily)
                .text(function (d) {
                    return 100 - v;
                })
                .classed("tick-text tick-a", true);

            svg.append("text")
                .attr("x", coord3[0] + 6)
                .attr("y", coord3[1])
                .attr("font-size", styling.scales.font.fontSize)
                .attr("font-family", styling.scales.font.fontFamily)
                .text(function (d) {
                    return v;
                })
                .classed("tick-text tick-c", true);
        });
    }

 

    mod.controls.errorOverlay.hide("Data Error");

    /**
     * Create popout content
     */
    const popoutContent = () => [
        section({
            heading: "Show axis labels",
            children: [
                radioButton({
                    name: showAxisLabels.name,
                    text: "Show axis labels",
                    value: "yes",
                    checked: is(showAxisLabels)("yes")
                }),
                radioButton({
                        name: showAxisLabels.name,
                        text: "Hide axis labels",
                        value: "no",
                        checked: is(showAxisLabels)("no")
                })
            ]
        })
    ];

    d3.select("#settings").selectAll("*").on("click",  (e) => {
        tooltip.hide();
        var pos = d3.mouse(d3.event.currentTarget);
        console.log(pos);
        
        popout.show(
            {
                x: d3.event.clientX,
                y: d3.event.clientY,
                autoClose: true,
                alignment: "Bottom",
                onChange: (event) => {
                    const { name, value } = event;
                    name == showAxisLabels.name && showAxisLabels.set(value);
                }
            },
            popoutContent
        );

    });


    //Draw, merge and raise the circles.
    var circles = svg.selectAll("circle").data(allRows, function (d) {
        return d.elementId(true);
    });

    var enter = circles.enter().append("circle").attr("r", 6);

    circles
        .merge(enter)
        .attr("cx", function (d) {
            return rowToCoords(d)[0];
        })
        .attr("cy", function (d) {
            return rowToCoords(d)[1];
        })
        .attr("fill", function (d) {
            var colr = d.color().hexCode;
            return colr;
        })
        .on("mouseover", function (d) {
            d3.select(this).classed("hover", true);
            tooltip.show(getTooltipFromRow(d));
        })
        .on("mouseout", function (d) {
            d3.select(this).classed("hover", false);
            tooltip.hide();
        })
        .on("click", function (d) {
            d.mark();
        });

    circles.exit().remove();
    circles.raise();


    function coord(a, b, c) {
        var sum,
            pos = [0, 0];

        sum = a + b + c;

        if (sum !== 0) {
            a /= sum;
            b /= sum;
            c /= sum;

            pos[0] = corners[0][0] * a + corners[1][0] * b + corners[2][0] * c; //x
            pos[1] = corners[0][1] * a + corners[1][1] * b + corners[2][1] * c; //y
        }

        return pos;
    }

    /**
     *
     * @param {Spotfire.DataViewRow} row
     */
    function getTooltipFromRow(row) {
        var a = Number(row.continuous("Bottom").value());
        var b = Number(row.continuous("Left").value());
        var c = Number(row.continuous("Right").value());
        var d = null;
        try {
            d = row.categorical("Color").formattedValue();
        } catch (error) {
            d = row.continuous("Color").formattedValue();
        }
        
        return (
            aAxisMeta.parts[0].displayName +
            ": " +
            a +
            "\n" +
            bAxisMeta.parts[0].displayName +
            ": " +
            b +
            "\n" +
            cAxisMeta.parts[0].displayName +
            ": " +
            c +
            "\n" +
            colorAxisMeta.parts[0].displayName +
            ": " +
            d
        );
    }

    function scale(/* point */ p, factor) {
        return [p[0] * factor, p[1] * factor];
    }


    /**
     * Get the formatted path as an array
     * @param {Spotfire.DataViewHierarchyNode} node
     * @returns {string[]}
     */
    function getFormattedValues(node) {
        let values = [];
        while (node.level >= 0) {
            values.push(node.formattedValue());
            node = node.parent;
        }
        return values.reverse();
    }

    /**
     *
     * @param {Spotfire.DataViewRow} row
     */
    function rowToCoords(row) {
        var a = Number(row.continuous("Bottom").value());
        var b = Number(row.continuous("Left").value());
        var c = Number(row.continuous("Right").value());

        return coord(b, a, c);
    }
}
