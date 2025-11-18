'use client';

import React, { useEffect, useRef, useState } from 'react';

interface SelectorOption {
  label: string;
  value: string;
}

interface SourceSelectorProps {
  categorySelection: string;
  onCategoryChange: (value: string) => void;
}

// 默认的视频分类选项
const defaultCategories: SelectorOption[] = [
  { label: '全部', value: '全部' },
  { label: '电影', value: '电影' },
  { label: '空姐', value: '空姐' },
  { label: '动漫', value: '动漫' },
  { label: '综艺', value: '综艺' },
  { label: '虐待', value: '虐待' },
  { label: 'SM', value: 'SM' },
];

const SourceSelector: React.FC<SourceSelectorProps> = ({
  categorySelection,
  onCategoryChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState<{
    left: number;
    width: number;
  }>({ left: 0, width: 0 });
  const [categories, _setCategories] = useState<SelectorOption[]>(defaultCategories);

  // 更新指示器位置
  const updateIndicatorPosition = (activeIndex: number) => {
    if (
      activeIndex >= 0 &&
      buttonRefs.current[activeIndex] &&
      containerRef.current
    ) {
      const timeoutId = setTimeout(() => {
        const button = buttonRefs.current[activeIndex];
        const container = containerRef.current;
        if (button && container) {
          const buttonRect = button.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();

          if (buttonRect.width > 0) {
            setIndicatorStyle({
              left: buttonRect.left - containerRect.left,
              width: buttonRect.width,
            });
          }
        }
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  };

  // 组件挂载时立即计算初始位置
  useEffect(() => {
    const activeIndex = categories.findIndex(
      (opt) => opt.value === categorySelection
    );
    const cleanup = updateIndicatorPosition(activeIndex);
    return cleanup;
  }, [categories, categorySelection]);

  // 监听选择器变化
  useEffect(() => {
    const activeIndex = categories.findIndex(
      (opt) => opt.value === categorySelection
    );
    const cleanup = updateIndicatorPosition(activeIndex);
    return cleanup;
  }, [categories, categorySelection]);

  // 渲染胶囊式选择器
  const renderCapsuleSelector = () => {
    return (
      <div
        ref={containerRef}
        className='relative inline-flex bg-gray-200/60 rounded-full p-0.5 sm:p-1 dark:bg-gray-700/60 backdrop-blur-sm'
      >
        {/* 滑动的白色背景指示器 */}
        {indicatorStyle.width > 0 && (
          <div
            className='absolute top-0.5 bottom-0.5 sm:top-1 sm:bottom-1 bg-white dark:bg-gray-500 rounded-full shadow-sm transition-all duration-300 ease-out'
            style={{
              left: `${indicatorStyle.left}px`,
              width: `${indicatorStyle.width}px`,
            }}
          />
        )}

        {categories.map((option, index) => {
          const isActive = categorySelection === option.value;
          return (
            <button
              key={option.value}
              ref={(el) => {
                buttonRefs.current[index] = el;
              }}
              onClick={() => onCategoryChange(option.value)}
              className={`relative z-10 px-2 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-full transition-all duration-200 whitespace-nowrap ${isActive
                ? 'text-gray-900 dark:text-gray-100 cursor-default'
                : 'text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 cursor-pointer'
                }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className='space-y-4 sm:space-y-6'>
      {/* 分类选择器 */}
      <div className='flex flex-col sm:flex-row sm:items-center gap-2'>
        <span className='text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 min-w-[48px]'>
          分类
        </span>
        <div className='overflow-x-auto'>
          {renderCapsuleSelector()}
        </div>
      </div>
    </div>
  );
};

export default SourceSelector;
