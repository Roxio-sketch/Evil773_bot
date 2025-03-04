def format_dialogue(input_file, output_file, character_name="{哪吒}"):
    """
    将特定格式的字幕文件转换为指定格式
    
    参数:
    input_file -- 输入文件路径
    output_file -- 输出文件路径
    character_name -- 要添加的角色名，默认为"{哪吒}"
    """
    with open(input_file, 'r', encoding='utf-8') as f_in:
        lines = f_in.readlines()
    
    formatted_lines = []
    
    for line in lines:
        if line.startswith('Dialogue:'):
            # 查找文本内容，即在最后一个,,之后和最后一个}之后的内容
            parts = line.split(',,')
            if len(parts) > 1:
                content_part = parts[-1]
                # 查找最后一个}后的内容
                text_start = content_part.rfind('}')
                if text_start != -1:
                    text = content_part[text_start + 1:].strip()
                    # 添加角色名并保存
                    formatted_line = f"{character_name}{text}\n"
                    formatted_lines.append(formatted_line)
    
    with open(output_file, 'w', encoding='utf-8') as f_out:
        f_out.writelines(formatted_lines)

# 使用示例
if __name__ == "__main__":
    # 创建示例输入文件
    example_input = """Dialogue: Marked=0,0:01:43.91,0:01:47.08,Default,,0000,0000,0000,,{\1c&H001FFFF1\fnKaiTi}天地灵气历经千年
Dialogue: Marked=0,0:01:47.16,0:01:50.62,Default,,0000,0000,0000,,{\1c&H001FFFF1\fnKaiTi}孕育出一颗混元珠"""
    
    with open("input.txt", "w", encoding="utf-8") as f:
        f.write(example_input)
    
    # 转换文件
    format_dialogue("input.txt", "output.txt")
    
    # 显示结果
    with open("output.txt", "r", encoding="utf-8") as f:
        result = f.read()
    
    print("转换结果:")
    print(result)