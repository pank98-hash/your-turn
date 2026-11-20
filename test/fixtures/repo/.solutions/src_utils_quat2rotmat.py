"""A solution file: must NEVER be scanned for placeholders.

This file raises NotImplementedError on purpose, but because it lives under
`.solutions/`, findPlaceholders must not report it as a pending point.
"""


def solved_helper():
    raise NotImplementedError("solved_helper —— 等你来实现")
