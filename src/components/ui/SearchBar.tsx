import React, { memo } from 'react';
import { StyleSheet } from 'react-native';
import { Searchbar } from 'react-native-paper';

import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * Catalog search input.
 *
 * Thin wrapper over Paper's `Searchbar` so every list gets the same height,
 * radius and clear button without repeating props.
 */

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function SearchBarBase({
  value,
  onChange,
  placeholder = 'Хайх...',
}: SearchBarProps): React.JSX.Element {
  const theme = useAppTheme();
  return (
    <Searchbar
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      mode="bar"
      style={[
        styles.bar,
        {
          backgroundColor: theme.custom.cardBackground,
          borderColor: theme.custom.subtleBorder,
        },
      ]}
      inputStyle={styles.input}
      autoCorrect={false}
      autoCapitalize="none"
      returnKeyType="search"
    />
  );
}

const styles = StyleSheet.create({
  bar: { borderRadius: 14, borderWidth: 1, height: 44 },
  input: { fontSize: 14, minHeight: 0 },
});

export const SearchBar = memo(SearchBarBase);
