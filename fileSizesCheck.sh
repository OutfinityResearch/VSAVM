#!/bin/bash

# File sizes and line length checker for VSAVM project

echo "=== VSAVM Project File Analysis ==="
echo

# Calculate total project size
echo "📊 PROJECT SIZE ANALYSIS"
echo "========================"

# Get total project size
total_size=$(du -sk . 2>/dev/null | cut -f1)
echo "Total project size: ${total_size} KB ($(echo "scale=1; $total_size/1024" | bc -l 2>/dev/null || echo "$(($total_size/1024))") MB)"

# Get docs directory size
if [ -d "docs" ]; then
    docs_size=$(du -sk docs 2>/dev/null | cut -f1)
    echo "Documentation size: ${docs_size} KB ($(echo "scale=1; $docs_size/1024" | bc -l 2>/dev/null || echo "$(($docs_size/1024))") MB)"
fi

# Get specs directory size
if [ -d "docs/specs" ]; then
    specs_size=$(du -sk docs/specs 2>/dev/null | cut -f1)
    echo "Specifications size: ${specs_size} KB ($(echo "scale=1; $specs_size/1024" | bc -l 2>/dev/null || echo "$(($specs_size/1024))") MB)"
fi

echo

# Analyze specification files
echo "📋 SPECIFICATION FILES ANALYSIS"
echo "================================"

spec_files=(
    "docs/specs/URS.md"
    "docs/specs/FS.md" 
    "docs/specs/NFS.md"
    "docs/specs/DS001-foundations-and-architecture.md"
    "docs/specs/DS002-vm-design-execution.md"
    "docs/specs/DS003-query-compilation-search.md"
    "docs/specs/DS004-correctness-bounded-closure.md"
    "docs/specs/DS005-training-learning-optimization.md"
)

total_spec_size=0
total_lines=0
total_long_lines=0
total_very_long_lines=0

for file in "${spec_files[@]}"; do
    if [ -f "$file" ]; then
        # Get file size in KB
        size_bytes=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
        size_kb=$((size_bytes / 1024))
        if [ $size_kb -eq 0 ]; then
            size_kb=1  # Show at least 1KB for small files
        fi
        
        # Count lines
        lines=$(wc -l < "$file")
        
        # Check for long lines (>120 chars) - terminal visibility warning
        long_lines=$(awk 'length($0) > 120 {count++} END {print count+0}' "$file")
        
        # Check for very long lines (>150 chars) - serious readability warning
        very_long_lines=$(awk 'length($0) > 150 {count++} END {print count+0}' "$file")
        
        # Check for extremely long lines (>200 chars) - critical warning
        extreme_lines=$(awk 'length($0) > 200 {print NR ": " length($0) " chars"}' "$file")
        
        filename=$(basename "$file")
        printf "%-45s %4d KB  %5d lines" "$filename" "$size_kb" "$lines"
        
        # Terminal visibility warnings
        if [ "$long_lines" -gt 0 ]; then
            printf "  ⚠️  %d lines >120 chars (terminal scroll)" "$long_lines"
        else
            printf "  ✅ All lines terminal-friendly"
        fi
        
        if [ "$very_long_lines" -gt 0 ]; then
            printf "  🚨 %d lines >150 chars (hard to read)" "$very_long_lines"
        fi
        echo
        
        # Show extremely long lines as critical warnings
        if [ -n "$extreme_lines" ]; then
            echo "   🔥 CRITICAL: Lines >200 chars (very hard to edit):"
            echo "$extreme_lines" | while read line; do
                echo "      $line"
            done
        fi
        
        # Show sample of very long lines for context
        very_long_sample=$(awk 'length($0) > 150 {print NR ": " length($0) " chars: " substr($0,1,60) "..."}' "$file" | head -3)
        if [ -n "$very_long_sample" ]; then
            echo "   📝 Sample long lines:"
            echo "$very_long_sample" | while read line; do
                echo "      $line"
            done
        fi
        
        total_spec_size=$((total_spec_size + size_kb))
        total_lines=$((total_lines + lines))
        total_long_lines=$((total_long_lines + long_lines))
        total_very_long_lines=$((total_very_long_lines + very_long_lines))
    else
        echo "❌ File not found: $file"
    fi
done

echo
echo "📈 SUMMARY"
echo "=========="
echo "Total specification files size: ${total_spec_size} KB ($(echo "scale=1; $total_spec_size/1024" | bc -l 2>/dev/null || echo "$(($total_spec_size/1024))") MB)"
echo "Total lines in specifications: ${total_lines}"
echo "Lines >120 chars (terminal scroll needed): ${total_long_lines}"
echo "Lines >150 chars (hard to read/edit): ${total_very_long_lines}"

# Terminal visibility assessment
if [ "$total_long_lines" -eq 0 ]; then
    echo "✅ All lines are terminal-friendly (<120 chars)"
elif [ "$total_long_lines" -lt 50 ]; then
    echo "⚠️  Few long lines - minor terminal readability issues"
elif [ "$total_long_lines" -lt 200 ]; then
    echo "🚨 Many long lines - significant terminal readability issues"
else
    echo "🔥 CRITICAL: Too many long lines - major terminal readability problems"
fi

echo
echo "💡 TERMINAL COMPATIBILITY GUIDE"
echo "==============================="
echo "• Standard terminal width: 80 characters (traditional)"
echo "• Modern terminal width: 120 characters (common)"
echo "• Wide terminal width: 150+ characters (requires wide screen)"
echo "• Lines >120 chars: Require horizontal scrolling on normal terminals"
echo "• Lines >150 chars: Difficult to read even on wide terminals"
echo "• Lines >200 chars: Very hard to edit, should be broken up"
echo
echo "🔧 RECOMMENDATIONS"
echo "=================="
if [ "$total_long_lines" -gt 0 ]; then
    echo "• Break long sentences at natural boundaries (periods, commas)"
    echo "• Use line continuation for complex technical descriptions"
    echo "• Consider restructuring very long paragraphs"
    echo "• Target 80-120 characters per line for best compatibility"
else
    echo "• Current line lengths are optimal for terminal viewing"
    echo "• Maintain current formatting standards"
fi
