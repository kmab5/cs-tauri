/*
 * stats.js — the *stat_chart screen.
 *
 * This file contains the ONE permitted Scene.prototype override in the project.
 * The stock stat_chart builds <div>s by hand and then measures offsetWidth to
 * shrink overflowing labels. Overriding it lets the renderer consume structured
 * data instead, so bars can be real <meter>-role elements with accessible
 * values rather than nested divs with inline widths.
 *
 * randomtest.js already overrides this same method, so the pattern is
 * sanctioned rather than a fork.
 *
 * Row types in the corpus: 75 percent, 21 text, 16 opposed_pair, 0 graphic.
 * Three renderers, not four.
 */

(function () {
  if (typeof Scene === 'undefined') return;

  Scene.prototype.stat_chart = function stat_chart() {
    this.paragraph();
    var parsed = this.parseStatChart();
    var self = this;

    var rows = parsed.map(function (row) {
      var value = self.evaluateExpr(self.tokenizeExpr(row.variable));
      var label = self.replaceVariables(row.label);
      var definition = self.replaceVariables(row.definition || '');

      if (row.type === 'text') {
        return { type: 'text', label: label, value: value, definition: definition };
      }
      if (row.type === 'opposed_pair') {
        return {
          type: 'opposed_pair',
          label: label,
          label2: self.replaceVariables(row.opposed_label),
          value: Number(value),
          definition: definition,
        };
      }
      return { type: 'percent', label: label, value: Number(value), definition: definition };
    });

    busPush({ kind: 'statchart', rows: rows });

    /* The stock implementation sets these after drawing. Without them the
     * engine believes the stats page is blank, so *finish returns to the story
     * immediately and the overlay closes before anything is shown. */
    this.prevLine = 'block';
    this.screenEmpty = false;
  };
})();
