from manim import *

class FreeBodyDiagrams(Scene):
    def construct(self):
        # 0. Title and Introduction
        title = Text("Understanding Free Body Diagrams (FBDs)").scale(0.9)
        self.play(Write(title))
        self.wait(1)

        intro_text = Text(
            "An FBD is a visual tool to analyze all external forces acting on a single object.",
            font_size=28
        ).next_to(title, DOWN, buff=0.7)
        self.play(FadeIn(intro_text))
        self.wait(2)
        self.play(FadeOut(title, intro_text))

        # --- Step 1: Isolate the Object ---
        step1_title = Text("Step 1: Isolate the Object of Interest").to_edge(UP)
        self.play(Write(step1_title))

        # Scenario: A block on a surface
        ground = Line(start=[-4, -2, 0], end=[4, -2, 0], color=GREY_A)
        block = Rectangle(width=2, height=1.5, color=BLUE_B, fill_opacity=0.8).move_to([0, -1.25, 0])
        block_label = Text("Object (Block)", font_size=20).next_to(block, DOWN, buff=0.1)

        self.play(Create(ground), Create(block), Write(block_label))
        self.wait(1)

        # Highlight the block
        highlight_rect = SurroundingRectangle(block, color=YELLOW, buff=0.2)
        self.play(Create(highlight_rect))
        self.wait(1.5)
        self.play(FadeOut(ground, highlight_rect, block_label))

        # --- Step 2: Represent it as a Point or Simple Shape ---
        step2_title = Text("Step 2: Represent it as a Point or Simple Shape").to_edge(UP)
        # Transform the previous title to the new one
        self.play(Transform(step1_title, step2_title))

        # Fade out block, bring in a central dot
        fbd_object = Dot(point=ORIGIN, radius=0.15, color=WHITE).set_opacity(1)
        # Transform the block into the FBD dot
        self.play(Transform(block, fbd_object)) 
        self.wait(1)

        object_desc = Text("Simplified Object", font_size=24).next_to(fbd_object, DOWN, buff=0.5)
        self.play(Write(object_desc))
        self.wait(1)
        self.play(FadeOut(object_desc))

        # --- Step 3: Identify ALL External Forces ---
        step3_title = Text("Step 3: Identify ALL External Forces Acting ON the Object").to_edge(UP)
        # Transform previous title
        self.play(Transform(step1_title, step3_title)) 

        # List common forces
        force_list_title = Text("Common External Forces:", font_size=28).next_to(fbd_object, UP, buff=1)
        force_list = BulletedList(
            "Gravity (Weight)",
            "Normal Force (from surfaces)",
            "Tension (from ropes/cables)",
            "Applied Force (push/pull)",
            "Friction (opposes motion, if present)",
            font_size=24
        ).scale(0.8).next_to(force_list_title, DOWN, buff=0.2).align_to(force_list_title, LEFT)
        force_list.shift(RIGHT * 0.5) 

        self.play(Write(force_list_title))
        self.play(LaggedStart(*[FadeIn(item, shift=DOWN) for item in force_list], lag_ratio=0.3))
        self.wait(3)

        self.play(FadeOut(force_list_title, force_list))

        # --- Step 4: Draw Force Vectors ---
        step4_title = Text("Step 4: Draw Force Vectors from the Object's Center").to_edge(UP)
        self.play(Transform(step1_title, step4_title))

        # Placeholder forces for illustration
        force1 = Arrow(start=fbd_object.get_center(), end=fbd_object.get_center() + UP*1.5, buff=0, color=RED)
        force1_label = MathTex(r"F_1", font_size=30).next_to(force1, RIGHT, buff=0.1)
        force2 = Arrow(start=fbd_object.get_center(), end=fbd_object.get_center() + DOWN*1.5, buff=0, color=GREEN)
        force2_label = MathTex(r"F_2", font_size=30).next_to(force2, RIGHT, buff=0.1)
        force3 = Arrow(start=fbd_object.get_center(), end=fbd_object.get_center() + LEFT*1.5, buff=0, color=BLUE)
        force3_label = MathTex(r"F_3", font_size=30).next_to(force3, DOWN, buff=0.1)

        self.play(GrowArrow(force1), Write(force1_label))
        self.wait(0.5)
        self.play(GrowArrow(force2), Write(force2_label))
        self.wait(0.5)
        self.play(GrowArrow(force3), Write(force3_label))
        self.wait(2)

        # Fade out all generic FBD parts to prepare for examples
        self.play(FadeOut(force1, force1_label, force2, force2_label, force3, force3_label, block, step1_title)) 
        self.wait(1)

        # --- Example 1: Block on a Table ---
        example1_title = Text("Example 1: Block on a Flat Surface").to_edge(UP)
        self.play(Write(example1_title))

        # Physical scenario
        table_ground = Line(start=[-3, -2, 0], end=[3, -2, 0], color=GREY_A)
        table_block = Rectangle(width=1.5, height=1, color=BLUE_B, fill_opacity=0.8).move_to([0, -1.5, 0])
        physical_scene1 = VGroup(table_ground, table_block).shift(LEFT * 3)

        self.play(Create(physical_scene1))
        self.wait(1)

        # FBD representation
        fbd_dot1 = Dot(point=RIGHT * 3, radius=0.15, color=WHITE).set_opacity(1)

        # Forces for block on table
        fg_arrow1 = Arrow(start=fbd_dot1.get_center(), end=fbd_dot1.get_center() + DOWN * 1.5, buff=0, color=RED)
        fg_label1 = MathTex(r"F_g \text{ (Weight)}", font_size=28).next_to(fg_arrow1, RIGHT, buff=0.1)

        fn_arrow1 = Arrow(start=fbd_dot1.get_center(), end=fbd_dot1.get_center() + UP * 1.5, buff=0, color=GREEN)
        fn_label1 = MathTex(r"F_N \text{ (Normal)}", font_size=28).next_to(fn_arrow1, RIGHT, buff=0.1)

        # Transition physical scene to FBD
        self.play(TransformFromCopy(table_block, fbd_dot1))
        self.wait(0.5)
        self.play(GrowArrow(fg_arrow1), Write(fg_label1))
        self.wait(0.5)
        self.play(GrowArrow(fn_arrow1), Write(fn_label1))
        self.wait(2)

        self.play(FadeOut(physical_scene1, fbd_dot1, fg_arrow1, fg_label1, fn_arrow1, fn_label1, example1_title))
        self.wait(1)

        # --- Example 2: Block Hanging from a Rope ---
        example2_title = Text("Example 2: Block Hanging from a Rope").to_edge(UP)
        self.play(Write(example2_title))

        # Physical scenario
        ceiling = Line(start=[-3, 2, 0], end=[3, 2, 0], color=GREY_A)
        rope = Line(start=[0, 2, 0], end=[0, 0.5, 0], color=GREY_B)
        hanging_block = Rectangle(width=1.5, height=1, color=ORANGE, fill_opacity=0.8).move_to([0, 0, 0])
        physical_scene2 = VGroup(ceiling, rope, hanging_block).shift(LEFT * 3)

        self.play(Create(physical_scene2))
        self.wait(1)

        # FBD representation
        fbd_dot2 = Dot(point=RIGHT * 3, radius=0.15, color=WHITE).set_opacity(1)

        # Forces for block hanging
        fg_arrow2 = Arrow(start=fbd_dot2.get_center(), end=fbd_dot2.get_center() + DOWN * 1.5, buff=0, color=RED)
        fg_label2 = MathTex(r"F_g \text{ (Weight)}", font_size=28).next_to(fg_arrow2, RIGHT, buff=0.1)

        ft_arrow2 = Arrow(start=fbd_dot2.get_center(), end=fbd_dot2.get_center() + UP * 1.5, buff=0, color=YELLOW_B)
        ft_label2 = MathTex(r"F_T \text{ (Tension)}", font_size=28).next_to(ft_arrow2, RIGHT, buff=0.1)

        # Transition physical scene to FBD
        self.play(TransformFromCopy(hanging_block, fbd_dot2))
        self.wait(0.5)
        self.play(GrowArrow(fg_arrow2), Write(fg_label2))
        self.wait(0.5)
        self.play(GrowArrow(ft_arrow2), Write(ft_label2))
        self.wait(2)

        self.play(FadeOut(physical_scene2, fbd_dot2, fg_arrow2, fg_label2, ft_arrow2, ft_label2, example2_title))
        self.wait(1)

        # --- Conclusion ---
        conclusion_title = Text("Why are FBDs Important?").to_edge(UP)
        conclusion_text = BulletedList(
            "They simplify complex scenarios.",
            "They help identify all relevant forces.",
            "They are the first step in applying Newton's Laws.",
            font_size=28
        ).scale(0.8).next_to(conclusion_title, DOWN, buff=0.7).align_to(conclusion_title, LEFT)
        conclusion_text.shift(RIGHT * 0.5)

        self.play(Write(conclusion_title))
        self.play(LaggedStart(*[FadeIn(item, shift=DOWN) for item in conclusion_text], lag_ratio=0.5))
        self.wait(4)

        final_remark = Text("Mastering FBDs is crucial for solving mechanics problems!", font_size=30).next_to(conclusion_text, DOWN, buff=1)
        self.play(Write(final_remark))
        self.wait(3)
        self.play(FadeOut(self.mobjects))
        self.wait(1)