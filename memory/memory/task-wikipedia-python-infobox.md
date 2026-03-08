# Task: Wikipedia Python Infobox Extraction

## Date: 2026-03-08

## Steps Taken

1. **Loaded agent-browser skill** for browser automation
2. **Launched Chrome** with debugging port using `node templates/launch-chrome-standalone.cjs`
3. **Connected to browser** on port 9222: `agent-browser connect 9222`
4. **Navigated to Wikipedia page**: `agent-browser open "https://en.wikipedia.org/wiki/Python_(programming_language)"`
5. **Retrieved page snapshot**: `agent-browser snapshot`
6. **Extracted infobox data** from the accessibility tree

## Results

- **First appeared**: 20 February 1991 (year: 1991)
- **Designed by**: Guido van Rossum

## Notes

- Use quotes around URLs with parentheses to avoid bash syntax errors
- The infobox data is found in the table element with rowheader cells
