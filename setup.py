from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

with open("requirements.txt", "r", encoding="utf-8") as fh:
    requirements = [line.strip() for line in fh if line.strip() and not line.startswith("#")]

setup(
    name="pedro-fantacalcio-bot",
    version="1.0.0",
    author="Your Name",
    author_email="your.email@example.com",
    description="Un bot Telegram intelligente per gestire il regolamento del canale fantacalcio",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/yourusername/pedro-fantacalcio-bot",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: End Users/Desktop",
        "Topic :: Communications :: Chat",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
    python_requires=">=3.8",
    install_requires=requirements,
    entry_points={
        "console_scripts": [
            "pedro-bot=bot:main",
        ],
    },
    keywords="telegram bot fantacalcio rules openai",
    project_urls={
        "Bug Reports": "https://github.com/yourusername/pedro-fantacalcio-bot/issues",
        "Source": "https://github.com/yourusername/pedro-fantacalcio-bot",
    },
) 