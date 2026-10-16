import { DsPaginationComponent } from './ds-pagination.component';

describe('DsPaginationComponent', () => {
  function create(): DsPaginationComponent {
    const component = new DsPaginationComponent();
    component.page = 1;
    component.pageCount = 3;
    return component;
  }

  it('émet pageChange en bornant à pageCount', () => {
    const component = create();
    const spy = jest.fn();
    component.pageChange.subscribe(spy);
    component.go(2);
    expect(spy).toHaveBeenCalledWith(2);
    component.go(99);
    expect(spy).toHaveBeenCalledWith(3);
  });

  it('n’émet pas si la page demandée est déjà affichée', () => {
    const component = create();
    const spy = jest.fn();
    component.pageChange.subscribe(spy);
    component.go(1);
    expect(spy).not.toHaveBeenCalled();
  });

  it('émet pageSizeChange uniquement si la taille change', () => {
    const component = create();
    component.pageSize = 50;
    const spy = jest.fn();
    component.pageSizeChange.subscribe(spy);
    const select = document.createElement('select');
    const option = document.createElement('option');
    option.value = '100';
    select.appendChild(option);
    select.value = '100';
    component.onPageSize({ target: select } as unknown as Event);
    expect(spy).toHaveBeenCalledWith(100);
    select.value = '50';
    spy.mockClear();
    component.onPageSize({ target: select } as unknown as Event);
    expect(spy).not.toHaveBeenCalled();
  });
});
