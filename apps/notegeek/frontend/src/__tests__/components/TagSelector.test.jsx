import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { renderWithProviders } from '../testUtils';
import TagSelector from '../../components/TagSelector';
import { tagQuery, filterTagOptions } from '../../utils/tagPath';

const TAGS = ['garden', 'house', 'house/garage', 'house/kitchen', 'houseboat', 'work/house'];

vi.mock('../../store/tagStore', () => {
    const store = { tags: [], fetchTags: vi.fn() };
    const useStore = vi.fn((selector) => (selector ? selector(store) : store));
    useStore.getState = () => store;
    return { default: useStore };
});

import useTagStore from '../../store/tagStore';

describe('tagQuery / filterTagOptions', () => {
    it('normalizes what is typed, keeping a trailing slash as "children of"', () => {
        expect(tagQuery(' house / garage ')).toBe('house/garage');
        expect(tagQuery('house / ')).toBe('house/');
        expect(tagQuery(' / ')).toBe('');
    });

    it('house/ offers the existing children, prefix matches first', () => {
        expect(filterTagOptions(TAGS, 'house/')).toEqual(['house/garage', 'house/kitchen']);
        expect(filterTagOptions(TAGS, 'house')).toEqual(['house', 'house/garage', 'house/kitchen', 'houseboat', 'work/house']);
        expect(filterTagOptions(TAGS, 'House / Kit')).toEqual(['house/kitchen']);
    });

    it('reads what is typed in the kebab-case standard; hyphens do not have to be typed', () => {
        const tags = ['geek-suite', 'work/geek-suite', 'geeky'];
        expect(tagQuery('GeekSuite')).toBe('geek-suite');
        expect(filterTagOptions(tags, 'GeekS')).toEqual(['geek-suite', 'work/geek-suite']);
        expect(filterTagOptions(tags, 'geeks')).toEqual(['geek-suite', 'work/geek-suite']);
        expect(filterTagOptions(tags, 'geek')).toEqual(['geek-suite', 'geeky', 'work/geek-suite']);
    });
});

describe('TagSelector', () => {
    beforeEach(() => {
        useTagStore.getState().tags = TAGS;
    });

    it('normalizes a typed tag before it becomes a chip', () => {
        const onChange = vi.fn();
        renderWithProviders(<TagSelector selectedTags={[]} onChange={onChange} />);
        const input = screen.getByRole('combobox', { name: 'Tags' });
        fireEvent.change(input, { target: { value: ' house / shed/ ' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onChange).toHaveBeenLastCalledWith(['house/shed']);
    });

    it('typing #GeekSuite commits the chip geek-suite', () => {
        const onChange = vi.fn();
        renderWithProviders(<TagSelector selectedTags={['work']} onChange={onChange} />);
        const input = screen.getByRole('combobox', { name: 'Tags' });
        fireEvent.change(input, { target: { value: '#GeekSuite' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onChange).toHaveBeenLastCalledWith(['work', 'geek-suite']);
    });

    it('does not add a duplicate of a chip already there once normalized', () => {
        const onChange = vi.fn();
        renderWithProviders(<TagSelector selectedTags={['house/garage']} onChange={onChange} />);
        const input = screen.getByRole('combobox', { name: 'Tags' });
        fireEvent.change(input, { target: { value: 'house // garage' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onChange).toHaveBeenLastCalledWith(['house/garage']);
    });

    it('typing house/ lists its children as full paths', async () => {
        renderWithProviders(<TagSelector selectedTags={[]} onChange={vi.fn()} />);
        const input = screen.getByRole('combobox', { name: 'Tags' });
        fireEvent.change(input, { target: { value: 'house/' } });
        const listbox = await screen.findByRole('listbox');
        expect(within(listbox).getAllByRole('option').map((o) => o.textContent)).toEqual(['house/garage', 'house/kitchen']);
    });
});
