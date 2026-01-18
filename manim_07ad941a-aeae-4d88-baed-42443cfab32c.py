import numpy as np
from manim import *

class IntegralExplanation(Scene):
    def construct(self):
        # -- 0. Introduction: What is an Integral? --
        title = Text("What is an Integral?", font_size=55).to_edge(UP, buff=0.5)
        self.play(Write(title))
        self.wait(1)

        # Setup Axes
        axes = Axes(
            x_range=[0, 3, 1],
            y_range=[0, 5, 1],
            x_length=6,
            y_length=4.5,
            axis_config={"include_numbers": True},
            tips=False # No arrows on axes for cleaner look
        ).to_edge(LEFT, buff=1)
        axes_labels = axes.get_axis_labels(x_label="x", y_label="f(x)")

        self.play(Create(axes), Create(axes_labels), run_time=1.5)
        self.wait(0.5)

        # Define a simple function: f(x) = x^2
        func = axes.get_graph(lambda x: x**2, x_range=[0, 2.5], color=BLUE_C)
        func_label = axes.get_graph_label(func, label="f(x) = x^2", x_val=2.2, direction=UP_RIGHT, color=BLUE_C)
        self.play(Create(func), FadeIn(func_label, shift=UP))
        self.wait(1)

        # -- 1. The Problem: Finding Area Under a Curve --
        area_problem_text = Text("How do we find the exact area under this curve?", font_size=32).next_to(title, DOWN)
        self.play(Transform(title, area_problem_text), FadeOut(func_label))
        self.wait(0.5)

        # Shade the area from x=0 to x=2
        area_x_range = [0, 2]
        area = axes.get_area(func, x_range=area_x_range, color=BLUE_A, opacity=0.6)
        self.play(FadeIn(area, shift=DOWN))
        self.wait(2)
        self.play(FadeOut(area)) # Fade out the exact area to prepare for approximation

        # -- 2. Approximation with Rectangles (Riemann Sums) --
        approx_text = Text("We can approximate it with rectangles!", font_size=38).next_to(title, DOWN)
        self.play(Transform(title, approx_text))
        self.wait(1)

        # Initial rectangles (n=4)
        num_rects_initial = 4
        rects = self._get_riemann_rectangles(
            axes, func, x_range=area_x_range, num_rects=num_rects_initial, color=GREEN_B, opacity=0.7
        )
        self.play(Create(rects))
        self.wait(1)

        # Highlight one rectangle and its dimensions
        one_rect_index = 1 # Pick the second rectangle for highlighting
        original_rect_state = rects[one_rect_index].copy() # Store original state
        one_rect_highlight = rects[one_rect_index].copy().set_color(YELLOW).set_stroke(YELLOW, width=3)
        self.play(Transform(rects[one_rect_index], one_rect_highlight))

        # Calculate coordinates for labels on the highlighted rectangle
        x_min_rect = area_x_range[0] + (one_rect_index * (area_x_range[1] - area_x_range[0]) / num_rects_initial)
        x_mid_rect = x_min_rect + (area_x_range[1] - area_x_range[0]) / (2 * num_rects_initial)
        y_height_rect = func.underlying_function(x_min_rect) # Height is f(x) at left edge

        dx_label = MathTex(r"\Delta x").next_to(axes.c2p(x_mid_rect, 0), DOWN, buff=0.1)
        
        # Position f(x) label on the left side, midway up the height
        left_midpoint_screen_coords = axes.c2p(x_min_rect, y_height_rect / 2)
        fx_label = MathTex(r"f(x)").next_to(left_midpoint_screen_coords, LEFT, buff=0.1)
        
        self.play(Write(dx_label), Write(fx_label))
        self.wait(1)

        # Introduce the area of one rectangle and the sum
        sum_formula_part = MathTex(r"f(x) \Delta x").move_to(axes).shift(RIGHT*2.5 + UP*1.5)
        area_text = Text("Area of one rectangle:", font_size=28).next_to(sum_formula_part, UP, buff=0.2, aligned_edge=LEFT)
        self.play(Write(area_text), Write(sum_formula_part))
        self.wait(1)

        total_sum_formula = MathTex(r"\sum_{i=1}^{n} f(x_i) \Delta x").next_to(sum_formula_part, DOWN, buff=0.5, aligned_edge=LEFT)
        total_sum_text = Text("Sum of all rectangle areas:", font_size=28).next_to(total_sum_formula, UP, buff=0.2, aligned_edge=LEFT)
        self.play(Write(total_sum_text), Write(total_sum_formula))
        self.wait(2)
        
        # Clean up labels and reset highlighted rectangle
        self.play(
            FadeOut(area_text), FadeOut(sum_formula_part),
            FadeOut(dx_label), FadeOut(fx_label),
            Transform(rects[one_rect_index], original_rect_state) # Transform it back to original state
        )
        self.wait(0.5)

        # -- 3. Improving the Approximation --
        improve_text = Text("More rectangles mean a better approximation!", font_size=38).next_to(title, DOWN)
        self.play(Transform(title, improve_text))
        self.wait(1)

        # Use ValueTracker for dynamic N
        n_value_tracker = ValueTracker(num_rects_initial)
        n_label = MathTex("n = ").next_to(total_sum_formula, LEFT)
        n_display = DecimalNumber(n_value_tracker.get_value(), num_decimal_places=0).next_to(n_label, RIGHT)
        
        self.play(FadeIn(n_label), FadeIn(n_display))

        # Updater for rectangles to change with n_value_tracker
        def update_rectangles(mob):
            new_num_rects = int(n_value_tracker.get_value())
            if new_num_rects < 1: new_num_rects = 1 # Ensure at least one rectangle
            new_rects = self._get_riemann_rectangles(
                axes, func, x_range=area_x_range, num_rects=new_num_rects, color=GREEN_B, opacity=0.7
            )
            mob.become(new_rects)

        rects.add_updater(update_rectangles)
        n_display.add_updater(lambda m: m.set_value(n_value_tracker.get_value()))
        self.add(n_display, rects) # Add rects with updater to scene for continuous updates

        self.play(n_value_tracker.animate.set_value(8), run_time=1)
        self.wait(0.5)
        self.play(n_value_tracker.animate.set_value(16), run_time=1)
        self.wait(0.5)
        self.play(n_value_tracker.animate.set_value(32), run_time=1)
        self.wait(0.5)
        self.play(n_value_tracker.animate.set_value(64), run_time=1.5)
        self.wait(1)

        # Show the limit concept: n -> infinity, dx -> 0
        self.remove(n_display, rects) # Remove updaters before further transformations
        
        limit_text_group = VGroup(
            MathTex(r"\text{As } n \to \infty"),
            MathTex(r"\text{and } \Delta x \to 0")
        ).arrange(DOWN, buff=0.2).next_to(title, DOWN, buff=0.5)

        self.play(Transform(title, limit_text_group[0]), FadeOut(total_sum_text), FadeOut(n_label))
        self.play(Write(limit_text_group[1]))
        self.wait(1)

        # Animate to many rectangles, then fade them out
        final_rects = self._get_riemann_rectangles(
            axes, func, x_range=area_x_range, num_rects=200, color=GREEN_B, opacity=0.7
        )
        self.play(Transform(rects, final_rects), run_time=2)
        self.wait(1)

        self.play(FadeOut(rects), FadeOut(limit_text_group), FadeOut(func)) # Clean up rectangles and limit text

        # -- 4. The Integral Symbol --
        integral_symbol_title = Text("Introducing the Integral Symbol", font_size=38).to_edge(UP, buff=0.5)
        self.play(Transform(title, integral_symbol_title))
        self.wait(0.5)

        # Transition from Limit of Sum to Integral Formula
        limit_sum_formula = MathTex(
            r"\lim_{n \to \infty} \sum_{i=1}^{n} f(x_i) \Delta x"
        ).move_to(ORIGIN)
        self.play(Transform(total_sum_formula, limit_sum_formula))
        self.wait(2)

        integral_formula = MathTex(r"\int_{a}^{b} f(x) \, dx").move_to(ORIGIN)
        self.play(TransformMatchingTex(total_sum_formula, integral_formula))
        self.wait(2)

        # Explain parts of the integral
        integral_parts_title = Text("Breaking Down the Integral", font_size=38).to_edge(UP, buff=0.5)
        self.play(Transform(title, integral_parts_title))

        explanation_integral = VGroup(
            MathTex(r"\int", r"\rightarrow \text{elongated S for Sum}"),
            MathTex(r"f(x)", r"\rightarrow \text{the function (height)}"),
            MathTex(r"dx", r"\rightarrow \text{infinitesimally small width}"),
            MathTex(r"a, b", r"\rightarrow \text{the interval of accumulation}")
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.6).next_to(integral_formula, RIGHT, buff=1.5)
        
        # Shrink and move integral formula to make space for explanations
        integral_formula_target = integral_formula.copy().scale(0.8).next_to(explanation_integral, LEFT, buff=0.5)
        self.play(Transform(integral_formula, integral_formula_target))

        # Animate explanations one by one
        self.play(
            FadeIn(explanation_integral[0][0], shift=LEFT), Write(explanation_integral[0][1]),
            run_time=1.5
        )
        self.play(
            FadeIn(explanation_integral[1][0], shift=LEFT), Write(explanation_integral[1][1]),
            run_time=1.5
        )
        self.play(
            FadeIn(explanation_integral[2][0], shift=LEFT), Write(explanation_integral[2][1]),
            run_time=1.5
        )
        self.play(
            FadeIn(explanation_integral[3][0], shift=LEFT), Write(explanation_integral[3][1]),
            run_time=1.5
        )
        self.wait(3)

        # -- 5. Visual Meaning: The Exact Area & Accumulation --
        self.play(FadeOut(explanation_integral), FadeOut(integral_formula), FadeOut(axes_labels), FadeOut(title))

        exact_area_title = Text("The Integral: Exact Area & Accumulation", font_size=45).to_edge(UP, buff=0.5)
        self.play(Write(exact_area_title))

        # Restore axes and function, then show the exact area
        self.play(axes.animate.to_edge(LEFT, buff=1), Create(axes_labels))
        self.play(Create(func))
        
        final_area = axes.get_area(func, x_range=area_x_range, color=BLUE_B, opacity=0.7)
        self.play(FadeIn(final_area, shift=DOWN))
        self.wait(2)

        final_explanation = Text(
            "Integrals give us the precise 'total' or 'accumulation' over an interval.\n"
            "Think of it as adding up infinitely many tiny pieces!",
            font_size=36,
            line_spacing=1.2
        ).next_to(exact_area_title, DOWN, buff=1).to_edge(RIGHT)
        
        self.play(Write(final_explanation))
        self.wait(5)

        # Final cleanup
        self.play(FadeOut(*self.mobjects))
        self.wait(1)

    # Helper function for generating Riemann Rectangles
    def _get_riemann_rectangles(self, axes, graph, x_range, num_rects, color, opacity):
        """
        Generates a VGroup of rectangles for a left Riemann sum.
        """
        x_min, x_max = x_range[0], x_range[1]
        dx = (x_max - x_min) / num_rects
        
        rects = axes.get_riemann_rectangles(
            graph=graph,
            x_range=x_range,
            dx=dx,
            stroke_width=0, # No stroke for cleaner look
            fill_opacity=opacity,
            color=color,
            input_sample_type="left" # Use left endpoints for rectangle height
        )
        return rects